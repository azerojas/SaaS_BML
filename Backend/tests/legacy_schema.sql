--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: fn_historial_estado_cita(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_historial_estado_cita() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO cita_estados_historial(cita_id, estado_anterior, estado_nuevo)
        VALUES (NEW.id, NULL, NEW.estado);
    ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
        INSERT INTO cita_estados_historial(cita_id, estado_anterior, estado_nuevo)
        VALUES (NEW.id, OLD.estado, NEW.estado);
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_slots_disponibles(bigint, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_slots_disponibles(p_profesional_id bigint, p_fecha date, p_duracion_minutos integer) RETURNS TABLE(inicio_en timestamp with time zone, fin_en timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    WITH cfg AS (
        SELECT intervalo_slots_minutos AS paso,
               anticipacion_minima_minutos AS minimo,
               anticipacion_maxima_dias AS maximo
        FROM configuracion_reservas
        WHERE id = 1 AND reservas_online_activas
    ),
    tramos AS (
        SELECT (p_fecha + h.hora_inicio) AT TIME ZONE 'America/Lima' AS t_ini,
               (p_fecha + h.hora_fin) AT TIME ZONE 'America/Lima' AS t_fin
        FROM horarios_profesional h
        WHERE h.profesional_id = p_profesional_id
          AND h.dia_semana = EXTRACT(ISODOW FROM p_fecha)::int
    ),
    candidatos AS (
        SELECT gs AS ini, gs + make_interval(mins => p_duracion_minutos) AS fin
        FROM tramos t CROSS JOIN cfg
        CROSS JOIN LATERAL generate_series(
            t.t_ini,
            t.t_fin - make_interval(mins => p_duracion_minutos),
            make_interval(mins => cfg.paso)
        ) gs
    )
    SELECT c.ini, c.fin
    FROM candidatos c CROSS JOIN cfg
    WHERE c.ini >= now() + make_interval(mins => cfg.minimo)
      AND c.ini < now() + make_interval(days => cfg.maximo)
      AND NOT EXISTS (
          SELECT 1 FROM citas ci
          WHERE ci.profesional_id = p_profesional_id
            AND ci.estado IN ('PENDIENTE_PAGO','PROGRAMADA','CONFIRMADA')
            AND (ci.estado <> 'PENDIENTE_PAGO' OR ci.expira_en > now())
            AND tstzrange(ci.inicio_en, ci.fin_en) && tstzrange(c.ini, c.fin)
      )
      AND NOT EXISTS (
          SELECT 1 FROM bloqueos_agenda b
          WHERE (b.profesional_id IS NULL OR b.profesional_id = p_profesional_id)
            AND tstzrange(b.inicio_en, b.fin_en) && tstzrange(c.ini, c.fin)
      )
    ORDER BY c.ini;
$$;


--
-- Name: fn_tocar_actualizado_en(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_tocar_actualizado_en() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.actualizado_en = now();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: anticipos_cita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anticipos_cita (
    id bigint NOT NULL,
    cita_id bigint NOT NULL,
    venta_id bigint,
    metodo character varying(18) NOT NULL,
    monto numeric(12,2) NOT NULL,
    estado character varying(12) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    referencia character varying(100),
    comprobante_url character varying(500),
    pagado_en timestamp with time zone,
    registrado_por_id integer,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT anticipos_cita_check CHECK ((((estado)::text <> 'CONFIRMADO'::text) OR (pagado_en IS NOT NULL))),
    CONSTRAINT anticipos_cita_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'CONFIRMADO'::character varying, 'REEMBOLSADO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT anticipos_cita_metodo_check CHECK (((metodo)::text = ANY ((ARRAY['EFECTIVO'::character varying, 'YAPE'::character varying, 'PLIN'::character varying, 'TRANSFERENCIA'::character varying, 'TARJETA'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT anticipos_cita_monto_check CHECK ((monto > (0)::numeric))
);


--
-- Name: anticipos_cita_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.anticipos_cita ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.anticipos_cita_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: articulos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articulos (
    id bigint NOT NULL,
    categoria_id bigint,
    unidad_id bigint NOT NULL,
    nombre character varying(160) NOT NULL,
    slug character varying(180),
    descripcion text,
    sku character varying(45),
    tipo character varying(12) NOT NULL,
    precio_venta numeric(12,2) DEFAULT 0 NOT NULL,
    stock_minimo numeric(14,3) DEFAULT 0 NOT NULL,
    visible_catalogo boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT articulos_precio_venta_check CHECK ((precio_venta >= (0)::numeric)),
    CONSTRAINT articulos_stock_minimo_check CHECK ((stock_minimo >= (0)::numeric)),
    CONSTRAINT articulos_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['INSUMO'::character varying, 'VENTA'::character varying, 'AMBOS'::character varying])::text[]))),
    CONSTRAINT ck_articulo_visible CHECK (((NOT visible_catalogo) OR ((tipo)::text = ANY ((ARRAY['VENTA'::character varying, 'AMBOS'::character varying])::text[]))))
);


--
-- Name: articulos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.articulos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.articulos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    id bigint NOT NULL,
    usuario_id integer,
    entidad character varying(80) NOT NULL,
    entidad_id character varying(80),
    accion character varying(25) NOT NULL,
    datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creada_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auditoria ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bloqueos_agenda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bloqueos_agenda (
    id bigint NOT NULL,
    profesional_id bigint,
    inicio_en timestamp with time zone NOT NULL,
    fin_en timestamp with time zone NOT NULL,
    motivo character varying(200),
    creado_por_id integer,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bloqueos_agenda_check CHECK ((fin_en > inicio_en))
);


--
-- Name: bloqueos_agenda_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.bloqueos_agenda ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.bloqueos_agenda_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: categorias_articulo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_articulo (
    id bigint NOT NULL,
    nombre character varying(100) NOT NULL
);


--
-- Name: categorias_articulo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categorias_articulo ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.categorias_articulo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: categorias_gasto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_gasto (
    id bigint NOT NULL,
    nombre character varying(100) NOT NULL
);


--
-- Name: categorias_gasto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categorias_gasto ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.categorias_gasto_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: categorias_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_servicio (
    id bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    activa boolean DEFAULT true NOT NULL
);


--
-- Name: categorias_servicio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categorias_servicio ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.categorias_servicio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cita_estados_historial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cita_estados_historial (
    id bigint NOT NULL,
    cita_id bigint NOT NULL,
    estado_anterior character varying(14),
    estado_nuevo character varying(14) NOT NULL,
    cambiado_por_id integer,
    origen character varying(10) DEFAULT 'SISTEMA'::character varying NOT NULL,
    detalle character varying(250),
    cambiado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cita_estados_historial_origen_check CHECK (((origen)::text = ANY ((ARRAY['CLIENTA'::character varying, 'STAFF'::character varying, 'SISTEMA'::character varying])::text[])))
);


--
-- Name: cita_estados_historial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cita_estados_historial ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cita_estados_historial_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cita_servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cita_servicios (
    id bigint NOT NULL,
    cita_id bigint NOT NULL,
    servicio_id bigint NOT NULL,
    orden smallint DEFAULT 1 NOT NULL,
    duracion_minutos integer NOT NULL,
    precio_snapshot numeric(12,2) NOT NULL,
    CONSTRAINT cita_servicios_duracion_minutos_check CHECK ((duracion_minutos > 0)),
    CONSTRAINT cita_servicios_precio_snapshot_check CHECK ((precio_snapshot >= (0)::numeric))
);


--
-- Name: cita_servicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cita_servicios ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cita_servicios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: citas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.citas (
    id bigint NOT NULL,
    clienta_id bigint NOT NULL,
    profesional_id bigint NOT NULL,
    visita_id bigint,
    codigo_reserva character varying(12) DEFAULT upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8)) NOT NULL,
    token_gestion uuid DEFAULT gen_random_uuid() NOT NULL,
    origen character varying(10) DEFAULT 'MANUAL'::character varying NOT NULL,
    estado character varying(14) DEFAULT 'PROGRAMADA'::character varying NOT NULL,
    inicio_en timestamp with time zone NOT NULL,
    fin_en timestamp with time zone NOT NULL,
    duracion_total_minutos integer,
    precio_total numeric(12,2) DEFAULT 0 NOT NULL,
    anticipo_requerido numeric(12,2) DEFAULT 0 NOT NULL,
    expira_en timestamp with time zone,
    confirmada_en timestamp with time zone,
    cancelada_en timestamp with time zone,
    cancelada_por character varying(10),
    motivo_cancelacion character varying(250),
    notas text,
    creada_por_id integer,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT citas_anticipo_requerido_check CHECK ((anticipo_requerido >= (0)::numeric)),
    CONSTRAINT citas_cancelada_por_check CHECK (((cancelada_por)::text = ANY ((ARRAY['CLIENTA'::character varying, 'NEGOCIO'::character varying, 'SISTEMA'::character varying])::text[]))),
    CONSTRAINT citas_check CHECK ((fin_en > inicio_en)),
    CONSTRAINT citas_check1 CHECK ((((estado)::text <> 'PENDIENTE_PAGO'::text) OR (expira_en IS NOT NULL))),
    CONSTRAINT citas_check2 CHECK ((((estado)::text <> 'CANCELADA'::text) OR (cancelada_en IS NOT NULL))),
    CONSTRAINT citas_check3 CHECK ((anticipo_requerido <= precio_total)),
    CONSTRAINT citas_duracion_total_minutos_check CHECK ((duracion_total_minutos > 0)),
    CONSTRAINT citas_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE_PAGO'::character varying, 'PROGRAMADA'::character varying, 'CONFIRMADA'::character varying, 'COMPLETADA'::character varying, 'CANCELADA'::character varying, 'NO_ASISTIO'::character varying, 'EXPIRADA'::character varying])::text[]))),
    CONSTRAINT citas_origen_check CHECK (((origen)::text = ANY ((ARRAY['ONLINE'::character varying, 'MANUAL'::character varying, 'TELEFONO'::character varying, 'WHATSAPP'::character varying])::text[]))),
    CONSTRAINT citas_precio_total_check CHECK ((precio_total >= (0)::numeric))
);


--
-- Name: citas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.citas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.citas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clientas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientas (
    id bigint NOT NULL,
    nombres character varying(120) NOT NULL,
    apellidos character varying(120) NOT NULL,
    telefono character varying(25) NOT NULL,
    email character varying(150),
    fecha_nacimiento date,
    notas_privadas text,
    consentimiento_datos boolean DEFAULT false NOT NULL,
    consentimiento_fecha timestamp with time zone,
    acepta_recordatorios boolean DEFAULT true NOT NULL,
    canal_preferido character varying(10) DEFAULT 'WHATSAPP'::character varying NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_consentimiento_fecha CHECK (((NOT consentimiento_datos) OR (consentimiento_fecha IS NOT NULL))),
    CONSTRAINT clientas_canal_preferido_check CHECK (((canal_preferido)::text = ANY ((ARRAY['WHATSAPP'::character varying, 'EMAIL'::character varying, 'SMS'::character varying])::text[])))
);


--
-- Name: clientas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.clientas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.clientas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: compras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compras (
    id bigint NOT NULL,
    proveedor_id bigint,
    numero_documento character varying(90),
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    estado character varying(12) DEFAULT 'BORRADOR'::character varying NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    observaciones text,
    creado_por_id integer,
    CONSTRAINT compras_estado_check CHECK (((estado)::text = ANY ((ARRAY['BORRADOR'::character varying, 'RECIBIDA'::character varying, 'ANULADA'::character varying])::text[]))),
    CONSTRAINT compras_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: compras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.compras ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.compras_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: configuracion_reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_reservas (
    id smallint DEFAULT 1 NOT NULL,
    reservas_online_activas boolean DEFAULT true NOT NULL,
    intervalo_slots_minutos integer DEFAULT 15 NOT NULL,
    anticipacion_minima_minutos integer DEFAULT 120 NOT NULL,
    anticipacion_maxima_dias integer DEFAULT 60 NOT NULL,
    horas_limite_cancelacion integer DEFAULT 24 NOT NULL,
    anticipo_porcentaje numeric(5,2) DEFAULT 0 NOT NULL,
    minutos_expiracion_pago integer DEFAULT 30 NOT NULL,
    max_citas_activas_por_clienta integer DEFAULT 3 NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT configuracion_reservas_anticipacion_maxima_dias_check CHECK ((anticipacion_maxima_dias > 0)),
    CONSTRAINT configuracion_reservas_anticipacion_minima_minutos_check CHECK ((anticipacion_minima_minutos >= 0)),
    CONSTRAINT configuracion_reservas_anticipo_porcentaje_check CHECK (((anticipo_porcentaje >= (0)::numeric) AND (anticipo_porcentaje <= (100)::numeric))),
    CONSTRAINT configuracion_reservas_horas_limite_cancelacion_check CHECK ((horas_limite_cancelacion >= 0)),
    CONSTRAINT configuracion_reservas_id_check CHECK ((id = 1)),
    CONSTRAINT configuracion_reservas_intervalo_slots_minutos_check CHECK (((intervalo_slots_minutos >= 5) AND (intervalo_slots_minutos <= 120))),
    CONSTRAINT configuracion_reservas_max_citas_activas_por_clienta_check CHECK ((max_citas_activas_por_clienta > 0)),
    CONSTRAINT configuracion_reservas_minutos_expiracion_pago_check CHECK ((minutos_expiracion_pago > 0))
);


--
-- Name: consumos_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumos_servicio (
    id bigint NOT NULL,
    detalle_venta_id bigint NOT NULL,
    articulo_id bigint NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    costo_unitario_snapshot numeric(12,4) NOT NULL,
    CONSTRAINT consumos_servicio_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT consumos_servicio_costo_unitario_snapshot_check CHECK ((costo_unitario_snapshot >= (0)::numeric))
);


--
-- Name: consumos_servicio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.consumos_servicio ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.consumos_servicio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: detalles_compra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalles_compra (
    id bigint NOT NULL,
    compra_id bigint NOT NULL,
    articulo_id bigint NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    costo_unitario numeric(12,4) NOT NULL,
    numero_lote character varying(80),
    vencimiento date,
    CONSTRAINT detalles_compra_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT detalles_compra_costo_unitario_check CHECK ((costo_unitario >= (0)::numeric))
);


--
-- Name: detalles_compra_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.detalles_compra ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.detalles_compra_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: detalles_venta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalles_venta (
    id bigint NOT NULL,
    venta_id bigint NOT NULL,
    tipo character varying(10) NOT NULL,
    servicio_id bigint,
    articulo_id bigint,
    profesional_id bigint,
    descripcion_snapshot character varying(200) NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    descuento_linea numeric(12,2) DEFAULT 0 NOT NULL,
    costo_unitario_snapshot numeric(12,4) DEFAULT 0 NOT NULL,
    comision_porcentaje_snapshot numeric(5,2) DEFAULT 0 NOT NULL,
    CONSTRAINT ck_detalle_profesional CHECK ((((tipo)::text = 'SERVICIO'::text) OR (profesional_id IS NULL))),
    CONSTRAINT ck_detalle_tipo_referencia CHECK (((((tipo)::text = 'SERVICIO'::text) AND (servicio_id IS NOT NULL) AND (articulo_id IS NULL)) OR (((tipo)::text = 'PRODUCTO'::text) AND (articulo_id IS NOT NULL) AND (servicio_id IS NULL)))),
    CONSTRAINT detalles_venta_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT detalles_venta_check CHECK ((descuento_linea <= (cantidad * precio_unitario))),
    CONSTRAINT detalles_venta_comision_porcentaje_snapshot_check CHECK (((comision_porcentaje_snapshot >= (0)::numeric) AND (comision_porcentaje_snapshot <= (100)::numeric))),
    CONSTRAINT detalles_venta_costo_unitario_snapshot_check CHECK ((costo_unitario_snapshot >= (0)::numeric)),
    CONSTRAINT detalles_venta_descuento_linea_check CHECK ((descuento_linea >= (0)::numeric)),
    CONSTRAINT detalles_venta_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric)),
    CONSTRAINT detalles_venta_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['SERVICIO'::character varying, 'PRODUCTO'::character varying])::text[])))
);


--
-- Name: detalles_venta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.detalles_venta ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.detalles_venta_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: gastos_operativos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gastos_operativos (
    id bigint NOT NULL,
    categoria_id bigint NOT NULL,
    descripcion character varying(250) NOT NULL,
    monto numeric(12,2) NOT NULL,
    fecha date NOT NULL,
    proveedor_id bigint,
    registrado_por_id integer,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gastos_operativos_monto_check CHECK ((monto > (0)::numeric))
);


--
-- Name: gastos_operativos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.gastos_operativos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.gastos_operativos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: horarios_profesional; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.horarios_profesional (
    id bigint NOT NULL,
    profesional_id bigint NOT NULL,
    dia_semana smallint NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    CONSTRAINT horarios_profesional_check CHECK ((hora_fin > hora_inicio)),
    CONSTRAINT horarios_profesional_dia_semana_check CHECK (((dia_semana >= 1) AND (dia_semana <= 7)))
);


--
-- Name: horarios_profesional_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.horarios_profesional ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.horarios_profesional_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: imagenes_catalogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imagenes_catalogo (
    id bigint NOT NULL,
    servicio_id bigint,
    articulo_id bigint,
    url character varying(500) NOT NULL,
    texto_alt character varying(200),
    orden integer DEFAULT 0 NOT NULL,
    es_principal boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT imagenes_catalogo_check CHECK (((((servicio_id IS NOT NULL))::integer + ((articulo_id IS NOT NULL))::integer) = 1))
);


--
-- Name: imagenes_catalogo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.imagenes_catalogo ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.imagenes_catalogo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lista_espera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lista_espera (
    id bigint NOT NULL,
    clienta_id bigint NOT NULL,
    servicio_id bigint NOT NULL,
    profesional_id bigint,
    fecha_deseada date NOT NULL,
    franja_inicio time without time zone,
    franja_fin time without time zone,
    estado character varying(12) DEFAULT 'ACTIVA'::character varying NOT NULL,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lista_espera_check CHECK (((franja_fin IS NULL) OR (franja_inicio IS NULL) OR (franja_fin > franja_inicio))),
    CONSTRAINT lista_espera_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVA'::character varying, 'NOTIFICADA'::character varying, 'CONVERTIDA'::character varying, 'CANCELADA'::character varying])::text[])))
);


--
-- Name: lista_espera_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.lista_espera ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.lista_espera_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: llegadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llegadas (
    id bigint NOT NULL,
    clienta_id bigint NOT NULL,
    punto_qr_id bigint,
    origen character varying(12) NOT NULL,
    estado character varying(12) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    solicitada_en timestamp with time zone DEFAULT now() NOT NULL,
    confirmada_en timestamp with time zone,
    confirmada_por_id integer,
    CONSTRAINT llegadas_check CHECK ((((estado)::text <> 'CONFIRMADA'::text) OR (confirmada_en IS NOT NULL))),
    CONSTRAINT llegadas_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'CONFIRMADA'::character varying, 'RECHAZADA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT llegadas_origen_check CHECK (((origen)::text = ANY ((ARRAY['QR'::character varying, 'MANUAL'::character varying])::text[])))
);


--
-- Name: llegadas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.llegadas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.llegadas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: movimientos_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_inventario (
    id bigint NOT NULL,
    articulo_id bigint NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    motivo character varying(24) NOT NULL,
    cantidad_firmada numeric(14,3) NOT NULL,
    costo_unitario numeric(12,4) DEFAULT 0 NOT NULL,
    detalle_compra_id bigint,
    consumo_servicio_id bigint,
    detalle_venta_id bigint,
    registrado_por_id integer,
    notas text,
    CONSTRAINT ck_movimiento_signo CHECK (((((motivo)::text = ANY ((ARRAY['COMPRA'::character varying, 'AJUSTE_ENTRADA'::character varying, 'DEVOLUCION'::character varying])::text[])) AND (cantidad_firmada > (0)::numeric)) OR (((motivo)::text = ANY ((ARRAY['CONSUMO_SERVICIO'::character varying, 'VENTA_PRODUCTO'::character varying, 'AJUSTE_SALIDA'::character varying])::text[])) AND (cantidad_firmada < (0)::numeric)))),
    CONSTRAINT movimientos_inventario_cantidad_firmada_check CHECK ((cantidad_firmada <> (0)::numeric)),
    CONSTRAINT movimientos_inventario_costo_unitario_check CHECK ((costo_unitario >= (0)::numeric)),
    CONSTRAINT movimientos_inventario_motivo_check CHECK (((motivo)::text = ANY ((ARRAY['COMPRA'::character varying, 'CONSUMO_SERVICIO'::character varying, 'VENTA_PRODUCTO'::character varying, 'AJUSTE_ENTRADA'::character varying, 'AJUSTE_SALIDA'::character varying, 'DEVOLUCION'::character varying])::text[])))
);


--
-- Name: movimientos_inventario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.movimientos_inventario ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.movimientos_inventario_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: negocio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negocio (
    id smallint DEFAULT 1 NOT NULL,
    nombre character varying(160) NOT NULL,
    ruc character varying(20),
    telefono character varying(25),
    email character varying(150),
    direccion character varying(250),
    moneda character(3) DEFAULT 'PEN'::bpchar NOT NULL,
    zona_horaria character varying(60) DEFAULT 'America/Lima'::character varying NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT negocio_id_check CHECK ((id = 1)),
    CONSTRAINT negocio_moneda_check CHECK ((moneda = 'PEN'::bpchar))
);


--
-- Name: notificaciones_cita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones_cita (
    id bigint NOT NULL,
    cita_id bigint NOT NULL,
    canal character varying(10) NOT NULL,
    tipo character varying(16) NOT NULL,
    programada_en timestamp with time zone NOT NULL,
    enviada_en timestamp with time zone,
    estado character varying(10) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    intentos smallint DEFAULT 0 NOT NULL,
    error character varying(300),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notificaciones_cita_canal_check CHECK (((canal)::text = ANY ((ARRAY['WHATSAPP'::character varying, 'EMAIL'::character varying, 'SMS'::character varying])::text[]))),
    CONSTRAINT notificaciones_cita_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'ENVIADA'::character varying, 'FALLIDA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT notificaciones_cita_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['CONFIRMACION'::character varying, 'RECORDATORIO'::character varying, 'CANCELACION'::character varying, 'REPROGRAMACION'::character varying, 'PAGO_PENDIENTE'::character varying])::text[])))
);


--
-- Name: notificaciones_cita_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notificaciones_cita ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.notificaciones_cita_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id bigint NOT NULL,
    venta_id bigint NOT NULL,
    metodo character varying(18) NOT NULL,
    monto numeric(12,2) NOT NULL,
    estado character varying(12) DEFAULT 'CONFIRMADO'::character varying NOT NULL,
    pagado_en timestamp with time zone DEFAULT now() NOT NULL,
    referencia character varying(100),
    registrado_por_id integer,
    CONSTRAINT pagos_estado_check CHECK (((estado)::text = ANY ((ARRAY['CONFIRMADO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT pagos_metodo_check CHECK (((metodo)::text = ANY ((ARRAY['EFECTIVO'::character varying, 'YAPE'::character varying, 'PLIN'::character varying, 'TRANSFERENCIA'::character varying, 'TARJETA'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT pagos_monto_check CHECK ((monto > (0)::numeric))
);


--
-- Name: pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pagos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.pagos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profesional_servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profesional_servicios (
    profesional_id bigint NOT NULL,
    servicio_id bigint NOT NULL
);


--
-- Name: profesionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profesionales (
    id bigint NOT NULL,
    usuario_id integer,
    nombres character varying(120) NOT NULL,
    apellidos character varying(120) NOT NULL,
    telefono character varying(25),
    foto_url character varying(500),
    comision_porcentaje numeric(5,2) DEFAULT 0 NOT NULL,
    visible_reservas boolean DEFAULT true NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profesionales_comision_porcentaje_check CHECK (((comision_porcentaje >= (0)::numeric) AND (comision_porcentaje <= (100)::numeric)))
);


--
-- Name: profesionales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.profesionales ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.profesionales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id bigint NOT NULL,
    nombre character varying(160) NOT NULL,
    ruc character varying(20),
    telefono character varying(25),
    email character varying(150),
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: proveedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.proveedores ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.proveedores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: puntos_qr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.puntos_qr (
    id bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: puntos_qr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.puntos_qr ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.puntos_qr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: recetas_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recetas_servicio (
    id bigint NOT NULL,
    servicio_id bigint NOT NULL,
    articulo_id bigint NOT NULL,
    cantidad_estimada numeric(14,3) NOT NULL,
    CONSTRAINT recetas_servicio_cantidad_estimada_check CHECK ((cantidad_estimada > (0)::numeric))
);


--
-- Name: recetas_servicio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.recetas_servicio ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.recetas_servicio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicios (
    id bigint NOT NULL,
    categoria_id bigint,
    nombre character varying(150) NOT NULL,
    slug character varying(160),
    descripcion text,
    duracion_minutos integer,
    precio_base numeric(12,2) NOT NULL,
    visible_catalogo boolean DEFAULT true NOT NULL,
    reservable_online boolean DEFAULT false NOT NULL,
    requiere_anticipo boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_servicio_reservable CHECK (((NOT reservable_online) OR (duracion_minutos IS NOT NULL))),
    CONSTRAINT servicios_duracion_minutos_check CHECK ((duracion_minutos > 0)),
    CONSTRAINT servicios_precio_base_check CHECK ((precio_base >= (0)::numeric))
);


--
-- Name: servicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.servicios ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.servicios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: unidades_medida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidades_medida (
    id bigint NOT NULL,
    codigo character varying(15) NOT NULL,
    nombre character varying(60) NOT NULL
);


--
-- Name: unidades_medida_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.unidades_medida ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.unidades_medida_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ventas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ventas (
    id bigint NOT NULL,
    visita_id bigint,
    clienta_id bigint,
    estado character varying(12) DEFAULT 'BORRADOR'::character varying NOT NULL,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    confirmada_en timestamp with time zone,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    descuento_global numeric(12,2) DEFAULT 0 NOT NULL,
    propina numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    creada_por_id integer,
    CONSTRAINT ventas_check CHECK ((descuento_global <= subtotal)),
    CONSTRAINT ventas_check1 CHECK ((((estado)::text <> 'CONFIRMADA'::text) OR (confirmada_en IS NOT NULL))),
    CONSTRAINT ventas_descuento_global_check CHECK ((descuento_global >= (0)::numeric)),
    CONSTRAINT ventas_estado_check CHECK (((estado)::text = ANY ((ARRAY['BORRADOR'::character varying, 'CONFIRMADA'::character varying, 'ANULADA'::character varying])::text[]))),
    CONSTRAINT ventas_propina_check CHECK ((propina >= (0)::numeric)),
    CONSTRAINT ventas_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT ventas_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: ventas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ventas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.ventas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: visitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitas (
    id bigint NOT NULL,
    clienta_id bigint NOT NULL,
    llegada_id bigint,
    inicio_en timestamp with time zone DEFAULT now() NOT NULL,
    fin_en timestamp with time zone,
    estado character varying(12) DEFAULT 'ABIERTA'::character varying NOT NULL,
    notas text,
    creada_por_id integer,
    CONSTRAINT visitas_check CHECK (((fin_en IS NULL) OR (fin_en >= inicio_en))),
    CONSTRAINT visitas_estado_check CHECK (((estado)::text = ANY ((ARRAY['ABIERTA'::character varying, 'FINALIZADA'::character varying, 'CANCELADA'::character varying])::text[])))
);


--
-- Name: visitas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.visitas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.visitas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vw_agenda_diaria; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_agenda_diaria AS
SELECT
    NULL::bigint AS cita_id,
    NULL::character varying(12) AS codigo_reserva,
    NULL::character varying(14) AS estado,
    NULL::character varying(10) AS origen,
    NULL::date AS fecha_local,
    NULL::timestamp with time zone AS inicio_en,
    NULL::timestamp with time zone AS fin_en,
    NULL::text AS clienta,
    NULL::text AS profesional,
    NULL::text AS servicios,
    NULL::numeric(12,2) AS precio_total,
    NULL::numeric(12,2) AS anticipo_requerido,
    NULL::numeric(12,2) AS anticipo_pagado;


--
-- Name: vw_stock_actual; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_stock_actual AS
 SELECT a.id AS articulo_id,
    a.nombre,
    a.tipo,
    u.codigo AS unidad,
    a.stock_minimo,
    (COALESCE(sum(m.cantidad_firmada), (0)::numeric))::numeric(14,3) AS existencia,
        CASE
            WHEN (COALESCE(sum(m.cantidad_firmada), (0)::numeric) <= a.stock_minimo) THEN true
            ELSE false
        END AS bajo_minimo
   FROM ((public.articulos a
     JOIN public.unidades_medida u ON ((u.id = a.unidad_id)))
     LEFT JOIN public.movimientos_inventario m ON ((m.articulo_id = a.id)))
  GROUP BY a.id, a.nombre, a.tipo, u.codigo, a.stock_minimo;


--
-- Name: vw_catalogo_articulos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_catalogo_articulos AS
 SELECT a.id,
    a.slug,
    a.nombre,
    a.descripcion,
    a.precio_venta,
    a.orden,
    c.nombre AS categoria,
    (COALESCE(st.existencia, (0)::numeric) > (0)::numeric) AS disponible,
    ( SELECT i.url
           FROM public.imagenes_catalogo i
          WHERE ((i.articulo_id = a.id) AND i.es_principal)
         LIMIT 1) AS imagen_principal
   FROM ((public.articulos a
     LEFT JOIN public.categorias_articulo c ON ((c.id = a.categoria_id)))
     LEFT JOIN public.vw_stock_actual st ON ((st.articulo_id = a.id)))
  WHERE (a.activo AND a.visible_catalogo AND ((a.tipo)::text = ANY ((ARRAY['VENTA'::character varying, 'AMBOS'::character varying])::text[])));


--
-- Name: vw_catalogo_servicios; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_catalogo_servicios AS
 SELECT s.id,
    s.slug,
    s.nombre,
    s.descripcion,
    s.duracion_minutos,
    s.precio_base,
    s.reservable_online,
    s.requiere_anticipo,
    s.orden,
    c.nombre AS categoria,
    ( SELECT i.url
           FROM public.imagenes_catalogo i
          WHERE ((i.servicio_id = s.id) AND i.es_principal)
         LIMIT 1) AS imagen_principal
   FROM (public.servicios s
     LEFT JOIN public.categorias_servicio c ON (((c.id = s.categoria_id) AND c.activa)))
  WHERE (s.activo AND s.visible_catalogo);


--
-- Name: vw_comisiones_servicios; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_comisiones_servicios AS
 SELECT dv.id AS detalle_id,
    dv.venta_id,
    dv.profesional_id,
    v.confirmada_en,
    (((dv.cantidad * dv.precio_unitario) - dv.descuento_linea))::numeric(14,2) AS ingreso_linea,
    dv.comision_porcentaje_snapshot,
    (((((dv.cantidad * dv.precio_unitario) - dv.descuento_linea) * dv.comision_porcentaje_snapshot) / (100)::numeric))::numeric(14,2) AS comision
   FROM (public.detalles_venta dv
     JOIN public.ventas v ON (((v.id = dv.venta_id) AND ((v.estado)::text = 'CONFIRMADA'::text))))
  WHERE (((dv.tipo)::text = 'SERVICIO'::text) AND (dv.profesional_id IS NOT NULL));


--
-- Name: vw_ingresos_diarios; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_ingresos_diarios AS
 SELECT ((p.pagado_en AT TIME ZONE 'America/Lima'::text))::date AS fecha_local,
    p.metodo,
    count(*) AS pagos_registrados,
    (sum(p.monto))::numeric(14,2) AS dinero_cobrado
   FROM (public.pagos p
     JOIN public.ventas v ON ((v.id = p.venta_id)))
  WHERE (((p.estado)::text = 'CONFIRMADO'::text) AND ((v.estado)::text = 'CONFIRMADA'::text))
  GROUP BY (((p.pagado_en AT TIME ZONE 'America/Lima'::text))::date), p.metodo;


--
-- Name: vw_margen_lineas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_margen_lineas AS
 SELECT dv.id AS detalle_id,
    dv.venta_id,
    dv.tipo,
    (((dv.cantidad * dv.precio_unitario) - dv.descuento_linea))::numeric(14,2) AS ingreso_linea,
        CASE
            WHEN ((dv.tipo)::text = 'PRODUCTO'::text) THEN ((dv.cantidad * dv.costo_unitario_snapshot))::numeric(14,2)
            ELSE (COALESCE(( SELECT sum((cs.cantidad * cs.costo_unitario_snapshot)) AS sum
               FROM public.consumos_servicio cs
              WHERE (cs.detalle_venta_id = dv.id)), (0)::numeric))::numeric(14,2)
        END AS costo_directo
   FROM (public.detalles_venta dv
     JOIN public.ventas v ON (((v.id = dv.venta_id) AND ((v.estado)::text = 'CONFIRMADA'::text))));


--
-- Name: anticipos_cita anticipos_cita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anticipos_cita
    ADD CONSTRAINT anticipos_cita_pkey PRIMARY KEY (id);


--
-- Name: articulos articulos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articulos
    ADD CONSTRAINT articulos_pkey PRIMARY KEY (id);


--
-- Name: articulos articulos_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articulos
    ADD CONSTRAINT articulos_sku_key UNIQUE (sku);


--
-- Name: articulos articulos_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articulos
    ADD CONSTRAINT articulos_slug_key UNIQUE (slug);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- Name: bloqueos_agenda bloqueos_agenda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bloqueos_agenda
    ADD CONSTRAINT bloqueos_agenda_pkey PRIMARY KEY (id);


--
-- Name: categorias_articulo categorias_articulo_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_articulo
    ADD CONSTRAINT categorias_articulo_nombre_key UNIQUE (nombre);


--
-- Name: categorias_articulo categorias_articulo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_articulo
    ADD CONSTRAINT categorias_articulo_pkey PRIMARY KEY (id);


--
-- Name: categorias_gasto categorias_gasto_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_gasto
    ADD CONSTRAINT categorias_gasto_nombre_key UNIQUE (nombre);


--
-- Name: categorias_gasto categorias_gasto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_gasto
    ADD CONSTRAINT categorias_gasto_pkey PRIMARY KEY (id);


--
-- Name: categorias_servicio categorias_servicio_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_servicio
    ADD CONSTRAINT categorias_servicio_nombre_key UNIQUE (nombre);


--
-- Name: categorias_servicio categorias_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_servicio
    ADD CONSTRAINT categorias_servicio_pkey PRIMARY KEY (id);


--
-- Name: cita_estados_historial cita_estados_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita_estados_historial
    ADD CONSTRAINT cita_estados_historial_pkey PRIMARY KEY (id);


--
-- Name: cita_servicios cita_servicios_cita_id_servicio_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita_servicios
    ADD CONSTRAINT cita_servicios_cita_id_servicio_id_key UNIQUE (cita_id, servicio_id);


--
-- Name: cita_servicios cita_servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita_servicios
    ADD CONSTRAINT cita_servicios_pkey PRIMARY KEY (id);


--
-- Name: citas citas_codigo_reserva_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_codigo_reserva_key UNIQUE (codigo_reserva);


--
-- Name: citas citas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_pkey PRIMARY KEY (id);


--
-- Name: citas citas_token_gestion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_token_gestion_key UNIQUE (token_gestion);


--
-- Name: citas citas_visita_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_visita_id_key UNIQUE (visita_id);


--
-- Name: clientas clientas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientas
    ADD CONSTRAINT clientas_pkey PRIMARY KEY (id);


--
-- Name: clientas clientas_telefono_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientas
    ADD CONSTRAINT clientas_telefono_key UNIQUE (telefono);


--
-- Name: compras compras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_pkey PRIMARY KEY (id);


--
-- Name: configuracion_reservas configuracion_reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_reservas
    ADD CONSTRAINT configuracion_reservas_pkey PRIMARY KEY (id);


--
-- Name: consumos_servicio consumos_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumos_servicio
    ADD CONSTRAINT consumos_servicio_pkey PRIMARY KEY (id);


--
-- Name: detalles_compra detalles_compra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_compra
    ADD CONSTRAINT detalles_compra_pkey PRIMARY KEY (id);


--
-- Name: detalles_venta detalles_venta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_venta
    ADD CONSTRAINT detalles_venta_pkey PRIMARY KEY (id);


--
-- Name: citas ex_citas_clienta_no_solape; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT ex_citas_clienta_no_solape EXCLUDE USING gist (clienta_id WITH =, tstzrange(inicio_en, fin_en) WITH &&) WHERE (((estado)::text = ANY ((ARRAY['PENDIENTE_PAGO'::character varying, 'PROGRAMADA'::character varying, 'CONFIRMADA'::character varying])::text[])));


--
-- Name: citas ex_citas_profesional_no_solape; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT ex_citas_profesional_no_solape EXCLUDE USING gist (profesional_id WITH =, tstzrange(inicio_en, fin_en) WITH &&) WHERE (((estado)::text = ANY ((ARRAY['PENDIENTE_PAGO'::character varying, 'PROGRAMADA'::character varying, 'CONFIRMADA'::character varying])::text[])));


--
-- Name: horarios_profesional ex_horarios_no_solape; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios_profesional
    ADD CONSTRAINT ex_horarios_no_solape EXCLUDE USING gist (profesional_id WITH =, dia_semana WITH =, numrange(EXTRACT(epoch FROM hora_inicio), EXTRACT(epoch FROM hora_fin)) WITH &&);


--
-- Name: gastos_operativos gastos_operativos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_operativos
    ADD CONSTRAINT gastos_operativos_pkey PRIMARY KEY (id);


--
-- Name: horarios_profesional horarios_profesional_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios_profesional
    ADD CONSTRAINT horarios_profesional_pkey PRIMARY KEY (id);


--
-- Name: imagenes_catalogo imagenes_catalogo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imagenes_catalogo
    ADD CONSTRAINT imagenes_catalogo_pkey PRIMARY KEY (id);


--
-- Name: lista_espera lista_espera_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_espera
    ADD CONSTRAINT lista_espera_pkey PRIMARY KEY (id);


--
-- Name: llegadas llegadas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llegadas
    ADD CONSTRAINT llegadas_pkey PRIMARY KEY (id);


--
-- Name: movimientos_inventario movimientos_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id);


--
-- Name: negocio negocio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocio
    ADD CONSTRAINT negocio_pkey PRIMARY KEY (id);


--
-- Name: notificaciones_cita notificaciones_cita_cita_id_canal_tipo_programada_en_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones_cita
    ADD CONSTRAINT notificaciones_cita_cita_id_canal_tipo_programada_en_key UNIQUE (cita_id, canal, tipo, programada_en);


--
-- Name: notificaciones_cita notificaciones_cita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones_cita
    ADD CONSTRAINT notificaciones_cita_pkey PRIMARY KEY (id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: profesional_servicios profesional_servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesional_servicios
    ADD CONSTRAINT profesional_servicios_pkey PRIMARY KEY (profesional_id, servicio_id);


--
-- Name: profesionales profesionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales
    ADD CONSTRAINT profesionales_pkey PRIMARY KEY (id);


--
-- Name: profesionales profesionales_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesionales
    ADD CONSTRAINT profesionales_usuario_id_key UNIQUE (usuario_id);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: puntos_qr puntos_qr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puntos_qr
    ADD CONSTRAINT puntos_qr_pkey PRIMARY KEY (id);


--
-- Name: puntos_qr puntos_qr_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puntos_qr
    ADD CONSTRAINT puntos_qr_token_key UNIQUE (token);


--
-- Name: recetas_servicio recetas_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recetas_servicio
    ADD CONSTRAINT recetas_servicio_pkey PRIMARY KEY (id);


--
-- Name: recetas_servicio recetas_servicio_servicio_id_articulo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recetas_servicio
    ADD CONSTRAINT recetas_servicio_servicio_id_articulo_id_key UNIQUE (servicio_id, articulo_id);


--
-- Name: servicios servicios_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_nombre_key UNIQUE (nombre);


--
-- Name: servicios servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_pkey PRIMARY KEY (id);


--
-- Name: servicios servicios_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_slug_key UNIQUE (slug);


--
-- Name: unidades_medida unidades_medida_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades_medida
    ADD CONSTRAINT unidades_medida_codigo_key UNIQUE (codigo);


--
-- Name: unidades_medida unidades_medida_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades_medida
    ADD CONSTRAINT unidades_medida_pkey PRIMARY KEY (id);


--
-- Name: ventas ventas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_pkey PRIMARY KEY (id);


--
-- Name: ventas ventas_visita_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_visita_id_key UNIQUE (visita_id);


--
-- Name: visitas visitas_llegada_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_llegada_id_key UNIQUE (llegada_id);


--
-- Name: visitas visitas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_pkey PRIMARY KEY (id);


--
-- Name: idx_anticipos_cita; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anticipos_cita ON public.anticipos_cita USING btree (cita_id, estado);


--
-- Name: idx_articulos_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articulos_categoria ON public.articulos USING btree (categoria_id);


--
-- Name: idx_articulos_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articulos_nombre ON public.articulos USING btree (nombre);


--
-- Name: idx_auditoria_entidad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_entidad ON public.auditoria USING btree (entidad, entidad_id);


--
-- Name: idx_bloqueos_profesional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bloqueos_profesional ON public.bloqueos_agenda USING btree (profesional_id, inicio_en);


--
-- Name: idx_bloqueos_rango; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bloqueos_rango ON public.bloqueos_agenda USING gist (tstzrange(inicio_en, fin_en));


--
-- Name: idx_cita_historial_cita; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cita_historial_cita ON public.cita_estados_historial USING btree (cita_id, cambiado_en);


--
-- Name: idx_cita_servicios_cita; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cita_servicios_cita ON public.cita_servicios USING btree (cita_id);


--
-- Name: idx_citas_clienta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citas_clienta ON public.citas USING btree (clienta_id, inicio_en DESC);


--
-- Name: idx_citas_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citas_inicio ON public.citas USING btree (inicio_en);


--
-- Name: idx_citas_pendientes_expira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citas_pendientes_expira ON public.citas USING btree (expira_en) WHERE ((estado)::text = 'PENDIENTE_PAGO'::text);


--
-- Name: idx_citas_profesional_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citas_profesional_inicio ON public.citas USING btree (profesional_id, inicio_en);


--
-- Name: idx_clientas_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientas_nombre ON public.clientas USING btree (apellidos, nombres);


--
-- Name: idx_consumos_detalle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumos_detalle ON public.consumos_servicio USING btree (detalle_venta_id);


--
-- Name: idx_detalles_compra_compra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalles_compra_compra ON public.detalles_compra USING btree (compra_id);


--
-- Name: idx_detalles_venta_profesional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalles_venta_profesional ON public.detalles_venta USING btree (profesional_id);


--
-- Name: idx_detalles_venta_venta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalles_venta_venta ON public.detalles_venta USING btree (venta_id);


--
-- Name: idx_gastos_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gastos_fecha ON public.gastos_operativos USING btree (fecha);


--
-- Name: idx_imagenes_articulo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imagenes_articulo ON public.imagenes_catalogo USING btree (articulo_id);


--
-- Name: idx_imagenes_servicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imagenes_servicio ON public.imagenes_catalogo USING btree (servicio_id);


--
-- Name: idx_lista_espera_activa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lista_espera_activa ON public.lista_espera USING btree (fecha_deseada, servicio_id) WHERE ((estado)::text = 'ACTIVA'::text);


--
-- Name: idx_llegadas_estado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llegadas_estado_fecha ON public.llegadas USING btree (estado, solicitada_en DESC);


--
-- Name: idx_movimientos_articulo_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimientos_articulo_fecha ON public.movimientos_inventario USING btree (articulo_id, fecha DESC);


--
-- Name: idx_notificaciones_pendientes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_pendientes ON public.notificaciones_cita USING btree (programada_en) WHERE ((estado)::text = 'PENDIENTE'::text);


--
-- Name: idx_pagos_fecha_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_fecha_estado ON public.pagos USING btree (pagado_en, estado);


--
-- Name: idx_pagos_venta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_venta ON public.pagos USING btree (venta_id);


--
-- Name: idx_servicios_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicios_categoria ON public.servicios USING btree (categoria_id);


--
-- Name: idx_ventas_confirmadas_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ventas_confirmadas_fecha ON public.ventas USING btree (confirmada_en) WHERE ((estado)::text = 'CONFIRMADA'::text);


--
-- Name: idx_visitas_clienta_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitas_clienta_fecha ON public.visitas USING btree (clienta_id, inicio_en DESC);


--
-- Name: uq_imagen_principal_articulo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_imagen_principal_articulo ON public.imagenes_catalogo USING btree (articulo_id) WHERE (es_principal AND (articulo_id IS NOT NULL));


--
-- Name: uq_imagen_principal_servicio; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_imagen_principal_servicio ON public.imagenes_catalogo USING btree (servicio_id) WHERE (es_principal AND (servicio_id IS NOT NULL));


--
-- Name: uq_llegada_pendiente_clienta; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_llegada_pendiente_clienta ON public.llegadas USING btree (clienta_id) WHERE ((estado)::text = 'PENDIENTE'::text);


--
-- Name: uq_mov_compra; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mov_compra ON public.movimientos_inventario USING btree (detalle_compra_id) WHERE (detalle_compra_id IS NOT NULL);


--
-- Name: uq_mov_consumo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mov_consumo ON public.movimientos_inventario USING btree (consumo_servicio_id) WHERE (consumo_servicio_id IS NOT NULL);


--
-- Name: uq_mov_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mov_producto ON public.movimientos_inventario USING btree (detalle_venta_id) WHERE (detalle_venta_id IS NOT NULL);


--
-- Name: vw_agenda_diaria _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.vw_agenda_diaria AS
 SELECT c.id AS cita_id,
    c.codigo_reserva,
    c.estado,
    c.origen,
    ((c.inicio_en AT TIME ZONE 'America/Lima'::text))::date AS fecha_local,
    c.inicio_en,
    c.fin_en,
    (((cl.nombres)::text || ' '::text) || (cl.apellidos)::text) AS clienta,
    (((pr.nombres)::text || ' '::text) || (pr.apellidos)::text) AS profesional,
    string_agg((s.nombre)::text, ', '::text ORDER BY cs.orden) AS servicios,
    c.precio_total,
    c.anticipo_requerido,
    (COALESCE(( SELECT sum(a.monto) AS sum
           FROM public.anticipos_cita a
          WHERE ((a.cita_id = c.id) AND ((a.estado)::text = 'CONFIRMADO'::text))), (0)::numeric))::numeric(12,2) AS anticipo_pagado
   FROM ((((public.citas c
     JOIN public.clientas cl ON ((cl.id = c.clienta_id)))
     JOIN public.profesionales pr ON ((pr.id = c.profesional_id)))
     LEFT JOIN public.cita_servicios cs ON ((cs.cita_id = c.id)))
     LEFT JOIN public.servicios s ON ((s.id = cs.servicio_id)))
  GROUP BY c.id, cl.nombres, cl.apellidos, pr.nombres, pr.apellidos;


--
-- Name: articulos trg_articulos_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_articulos_actualizado BEFORE UPDATE ON public.articulos FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_actualizado_en();


--
-- Name: citas trg_citas_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_citas_actualizado BEFORE UPDATE ON public.citas FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_actualizado_en();


--
-- Name: clientas trg_clientas_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clientas_actualizado BEFORE UPDATE ON public.clientas FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_actualizado_en();


--
-- Name: configuracion_reservas trg_config_reservas_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_config_reservas_actualizado BEFORE UPDATE ON public.configuracion_reservas FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_actualizado_en();


--
-- Name: citas trg_historial_estado_cita_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_historial_estado_cita_ins AFTER INSERT ON public.citas FOR EACH ROW EXECUTE FUNCTION public.fn_historial_estado_cita();


--
-- Name: citas trg_historial_estado_cita_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_historial_estado_cita_upd AFTER UPDATE OF estado ON public.citas FOR EACH ROW EXECUTE FUNCTION public.fn_historial_estado_cita();


--
-- Name: servicios trg_servicios_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_servicios_actualizado BEFORE UPDATE ON public.servicios FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_actualizado_en();


--
-- Name: anticipos_cita anticipos_cita_cita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anticipos_cita
    ADD CONSTRAINT anticipos_cita_cita_id_fkey FOREIGN KEY (cita_id) REFERENCES public.citas(id) ON DELETE RESTRICT;


--
-- Name: anticipos_cita anticipos_cita_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anticipos_cita
    ADD CONSTRAINT anticipos_cita_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE RESTRICT;


--
-- Name: articulos articulos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articulos
    ADD CONSTRAINT articulos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_articulo(id) ON DELETE SET NULL;


--
-- Name: articulos articulos_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articulos
    ADD CONSTRAINT articulos_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.unidades_medida(id);


--
-- Name: bloqueos_agenda bloqueos_agenda_profesional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bloqueos_agenda
    ADD CONSTRAINT bloqueos_agenda_profesional_id_fkey FOREIGN KEY (profesional_id) REFERENCES public.profesionales(id) ON DELETE CASCADE;


--
-- Name: cita_estados_historial cita_estados_historial_cita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita_estados_historial
    ADD CONSTRAINT cita_estados_historial_cita_id_fkey FOREIGN KEY (cita_id) REFERENCES public.citas(id) ON DELETE CASCADE;


--
-- Name: cita_servicios cita_servicios_cita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita_servicios
    ADD CONSTRAINT cita_servicios_cita_id_fkey FOREIGN KEY (cita_id) REFERENCES public.citas(id) ON DELETE CASCADE;


--
-- Name: cita_servicios cita_servicios_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita_servicios
    ADD CONSTRAINT cita_servicios_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE RESTRICT;


--
-- Name: citas citas_clienta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES public.clientas(id) ON DELETE RESTRICT;


--
-- Name: citas citas_profesional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_profesional_id_fkey FOREIGN KEY (profesional_id) REFERENCES public.profesionales(id) ON DELETE RESTRICT;


--
-- Name: citas citas_visita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES public.visitas(id) ON DELETE SET NULL;


--
-- Name: compras compras_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL;


--
-- Name: consumos_servicio consumos_servicio_articulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumos_servicio
    ADD CONSTRAINT consumos_servicio_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES public.articulos(id) ON DELETE RESTRICT;


--
-- Name: consumos_servicio consumos_servicio_detalle_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumos_servicio
    ADD CONSTRAINT consumos_servicio_detalle_venta_id_fkey FOREIGN KEY (detalle_venta_id) REFERENCES public.detalles_venta(id) ON DELETE RESTRICT;


--
-- Name: detalles_compra detalles_compra_articulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_compra
    ADD CONSTRAINT detalles_compra_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES public.articulos(id) ON DELETE RESTRICT;


--
-- Name: detalles_compra detalles_compra_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_compra
    ADD CONSTRAINT detalles_compra_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE RESTRICT;


--
-- Name: detalles_venta detalles_venta_articulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_venta
    ADD CONSTRAINT detalles_venta_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES public.articulos(id) ON DELETE RESTRICT;


--
-- Name: detalles_venta detalles_venta_profesional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_venta
    ADD CONSTRAINT detalles_venta_profesional_id_fkey FOREIGN KEY (profesional_id) REFERENCES public.profesionales(id) ON DELETE SET NULL;


--
-- Name: detalles_venta detalles_venta_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_venta
    ADD CONSTRAINT detalles_venta_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE RESTRICT;


--
-- Name: detalles_venta detalles_venta_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_venta
    ADD CONSTRAINT detalles_venta_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE RESTRICT;


--
-- Name: gastos_operativos gastos_operativos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_operativos
    ADD CONSTRAINT gastos_operativos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_gasto(id) ON DELETE RESTRICT;


--
-- Name: gastos_operativos gastos_operativos_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_operativos
    ADD CONSTRAINT gastos_operativos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL;


--
-- Name: horarios_profesional horarios_profesional_profesional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios_profesional
    ADD CONSTRAINT horarios_profesional_profesional_id_fkey FOREIGN KEY (profesional_id) REFERENCES public.profesionales(id) ON DELETE CASCADE;


--
-- Name: imagenes_catalogo imagenes_catalogo_articulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imagenes_catalogo
    ADD CONSTRAINT imagenes_catalogo_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES public.articulos(id) ON DELETE CASCADE;


--
-- Name: imagenes_catalogo imagenes_catalogo_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imagenes_catalogo
    ADD CONSTRAINT imagenes_catalogo_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE CASCADE;


--
-- Name: lista_espera lista_espera_clienta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_espera
    ADD CONSTRAINT lista_espera_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES public.clientas(id) ON DELETE CASCADE;


--
-- Name: lista_espera lista_espera_profesional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_espera
    ADD CONSTRAINT lista_espera_profesional_id_fkey FOREIGN KEY (profesional_id) REFERENCES public.profesionales(id) ON DELETE CASCADE;


--
-- Name: lista_espera lista_espera_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_espera
    ADD CONSTRAINT lista_espera_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE CASCADE;


--
-- Name: llegadas llegadas_clienta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llegadas
    ADD CONSTRAINT llegadas_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES public.clientas(id) ON DELETE RESTRICT;


--
-- Name: llegadas llegadas_punto_qr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llegadas
    ADD CONSTRAINT llegadas_punto_qr_id_fkey FOREIGN KEY (punto_qr_id) REFERENCES public.puntos_qr(id) ON DELETE SET NULL;


--
-- Name: movimientos_inventario movimientos_inventario_articulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES public.articulos(id) ON DELETE RESTRICT;


--
-- Name: movimientos_inventario movimientos_inventario_consumo_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_consumo_servicio_id_fkey FOREIGN KEY (consumo_servicio_id) REFERENCES public.consumos_servicio(id) ON DELETE RESTRICT;


--
-- Name: movimientos_inventario movimientos_inventario_detalle_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_detalle_compra_id_fkey FOREIGN KEY (detalle_compra_id) REFERENCES public.detalles_compra(id) ON DELETE RESTRICT;


--
-- Name: movimientos_inventario movimientos_inventario_detalle_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_detalle_venta_id_fkey FOREIGN KEY (detalle_venta_id) REFERENCES public.detalles_venta(id) ON DELETE RESTRICT;


--
-- Name: notificaciones_cita notificaciones_cita_cita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones_cita
    ADD CONSTRAINT notificaciones_cita_cita_id_fkey FOREIGN KEY (cita_id) REFERENCES public.citas(id) ON DELETE CASCADE;


--
-- Name: pagos pagos_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE RESTRICT;


--
-- Name: profesional_servicios profesional_servicios_profesional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesional_servicios
    ADD CONSTRAINT profesional_servicios_profesional_id_fkey FOREIGN KEY (profesional_id) REFERENCES public.profesionales(id) ON DELETE CASCADE;


--
-- Name: profesional_servicios profesional_servicios_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profesional_servicios
    ADD CONSTRAINT profesional_servicios_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE CASCADE;


--
-- Name: recetas_servicio recetas_servicio_articulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recetas_servicio
    ADD CONSTRAINT recetas_servicio_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES public.articulos(id) ON DELETE RESTRICT;


--
-- Name: recetas_servicio recetas_servicio_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recetas_servicio
    ADD CONSTRAINT recetas_servicio_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE RESTRICT;


--
-- Name: servicios servicios_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_servicio(id) ON DELETE SET NULL;


--
-- Name: ventas ventas_clienta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES public.clientas(id) ON DELETE RESTRICT;


--
-- Name: ventas ventas_visita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES public.visitas(id) ON DELETE RESTRICT;


--
-- Name: visitas visitas_clienta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES public.clientas(id) ON DELETE RESTRICT;


--
-- Name: visitas visitas_llegada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_llegada_id_fkey FOREIGN KEY (llegada_id) REFERENCES public.llegadas(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

