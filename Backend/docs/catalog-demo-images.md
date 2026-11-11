# Imágenes del catálogo de demostración

Se añadieron fotografías de referencia de Pexels a los 6 tratamientos y 4 productos demo, por solicitud del usuario. No son fotografías del salón, de sus clientas ni de resultados propios. Los registros conservan la descripción de demostración; el texto alternativo identifica las fotos como referenciales.

Solo se autorizó `images.pexels.com` en la configuración privada local; Nginx deriva de esa lista su CSP. Continúan las validaciones HTTPS, host exacto, ausencia de credenciales/IP y límites de longitud. No se relajó la política global a cualquier dominio. No se subieron archivos a Django ni se modificaron tablas, stock, pagos o registros ajenos al demo.

| Uso demo | Foto original | Autor |
|---|---|---|
| Extensiones clásicas | https://www.pexels.com/photo/a-young-woman-having-eyelash-extensions-7446922/ | Gustavo Fring |
| Volumen ligero | https://www.pexels.com/photo/a-woman-putting-cosmetic-lashes-on-clients-eye-5128233/ | Nataliya Vaitkevich |
| Lifting | https://www.pexels.com/photo/hands-holding-make-up-tools-near-woman-s-face-8558246/ | Nataliya Vaitkevich |
| Perfilado | https://www.pexels.com/photo/person-plucking-woman-s-eyebrow-5178009/ | Antoni Shkraba |
| Laminado | https://www.pexels.com/photo/a-hand-plucking-the-eyebrow-hair-of-the-client-8558247/ | Nataliya Vaitkevich |
| Facial | https://www.pexels.com/photo/a-woman-having-a-facial-treatment-5659049/ | Ivan S |
| Espuma | https://www.pexels.com/photo/photo-of-bottle-2587177/ | Venus HD Make-up & Perfume |
| Cepillo | https://www.pexels.com/photo/a-hand-holding-tweezers-and-mascara-brush-5128120/ | Nataliya Vaitkevich |
| Sérum | https://www.pexels.com/photo/close-up-of-a-dropper-with-skincare-serum-30229017/ | Ani Coloca |
| Kit | https://www.pexels.com/photo/pump-bottles-with-skincare-products-and-hand-of-a-woman-with-foam-16378440/ | mearlywan |

Licencia consultada: https://www.pexels.com/license/. No se implica recomendación de los productos demo por las personas o marcas fotografiadas. Referencias guardadas por `scripts/populate_demo_catalog_images.py`, ejecución explícita con BEAUTY_ALLOW_LOCAL_DEMO=1, guardia de base local Lasheo, transacción atómica y auditoría mediante servicios existentes. Repetir no duplica las mismas referencias ni reemplaza la principal elegida por el usuario.

Comprobación: descarga de las diez URLs HTTPS con tipo JPEG/WebP y tamaño acotado antes de registrarlas; luego comprobación de imagen_principal en API pública y carga real en navegador. Las URLs dependen de la disponibilidad de Pexels; los componentes mantienen su fallback cuando falla una imagen.

Reversión: retirar estas referencias exactas desde la galería administrativa usando sus IDs del manifiesto local `backups/catalog-demo-images-manifest.json`. No borrar productos/tratamientos. Si ya no se necesita el CDN, retirar solo images.pexels.com de los entornos privados y reiniciar la operación local para regenerar CSP. La configuración anterior se conservó en la carpeta privada.
