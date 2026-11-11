# Ejecución silenciosa de tareas locales

Se corrigieron `scripts/local_operations.py`, `scripts/backup_database.py`, `scripts/restore_verify.py` y `deployment/start_local_operation.py`: todos sus lanzamientos subprocess usan `CREATE_NO_WINDOW` en Windows y conservan el comportamiento anterior en otros sistemas.

Las tareas ya entraban mediante pythonw.exe, pero eso no impide que herramientas secundarias de consola creen otra ventana. `powershell -WindowStyle Hidden` por sí solo también podía mostrar una ventana antes de ocultarla. El indicador evita crear la consola desde el inicio; se mantienen captura de salidas, códigos de retorno, límites de tiempo, respaldos y notificaciones locales.

Verificación ejecutada: compilación Python de los cuatro archivos; comprobación de todos sus lanzamientos; ejecución real de PowerShell a través de `local_operations.execute` y consulta Win32 `GetConsoleWindow`, resultado 0 (sin consola). Se volvió a ejecutar LasheoLocalProbe mediante el Programador de tareas para comprobar funcionamiento operativo.

No se cambian frecuencias, permisos, credenciales ni tablas. La corrección se aplica a la siguiente ejecución nativa sin volver a registrar tareas. Reversión: retirar únicamente el diccionario BACKGROUND_PROCESS y sus expansiones en esos cuatro archivos; reaparecería la posibilidad de ventanas de consola. No requiere restaurar la base de datos ni reiniciar PostgreSQL.
