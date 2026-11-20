# Paleta Élixir Sanctuary

Los 47 valores del bloque YAML `colors` suministrado son la fuente de color en `src/styles/_palette.scss`. Se priorizan esos valores sobre los ejemplos distintos de la descripción: principal `#8d4935`, secundario `#466557` y fondo `#fff8f3`.

Los mismos colores configuran Angular Material y las variables de la aplicación, incluidos overlays, formularios, login, navegación, agenda, reportes y reservas. Terracota identifica acciones; salvia, disponibilidad y confirmaciones; rojo, errores y cancelaciones. Los nombres anteriores de variables se conservan como alias para no duplicar valores. Tipografía, composición y lógica de la agenda se conservan.

La revisión incluyó compilación, lint, TypeScript y pruebas de navegador de contraste y funcionamiento en móvil/escritorio. La prueba amplia `phase5: dashboard y reportes responsive y accesibles: 1440` detecta además `label-content-name-mismatch` en el logo y menú de usuario: sus nombres accesibles preexistentes no incluyen todo su texto visible. Este cambio de paleta no modifica ese HTML ni reduce las comprobaciones de esa prueba.
