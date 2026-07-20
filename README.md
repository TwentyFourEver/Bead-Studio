# Bead Studio

Editor web de patrones de tejido con una retícula alternada de mostacillas verticales y horizontales. Todo el trabajo se realiza en el navegador y se guarda en `localStorage`.

## Ejecutar en desarrollo

```powershell
npm.cmd install
npm.cmd run dev
```

Abre la dirección local que muestra Vite, normalmente `http://localhost:5173`.

## Verificar y compilar

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

La compilación de producción se genera en `dist/`.

## Controles

- Pincel: clic o arrastre sobre una bolita; atajo `B`.
- Borrador: clic o arrastre; atajo `E`.
- Selección: clic sobre una bolita pintada o arrastre un marco; atajo `V`. Usa `Mayús` para sumar al conjunto, arrastra para mover, `Supr` para borrar y `Esc` para deseleccionar.
- Borrado rápido: clic derecho o arrastre con el botón derecho, sin cambiar de herramienta.
- Deshacer: `Ctrl+Z`; cada arrastre completo cuenta como un solo trazo.
- Zoom: rueda del ratón, botones `+`/`−` o teclas `+`/`−`.
- Paneo: barra espaciadora más arrastre, o arrastre con el botón central.
- Simetría: lateral, arriba/abajo o ambos ejes.
- Guía numerada: activa **Numerar pasos** o pulsa `N`. En modo **Manual**, haz clic entre las cuentas siguiendo el recorrido del hilo. En modo **Automática**, la aplicación detecta las cruces completas de cuatro cuentas y las numera horizontalmente por filas: la primera de derecha a izquierda, la siguiente de izquierda a derecha y así sucesivamente. El primer paso marca el inicio y puedes cambiar al modo manual para corregir el orden. La guía puede ocultarse sin borrarla; su visibilidad se guarda en el proyecto y determina si aparece en el PNG.
- Referencia: carga una imagen en una ventana flotante, movible y redimensionable, para verla mientras dibujas. Desde el mismo menú puedes cambiar al modo Calcado, ajustar opacidad, tamaño y posición, o arrastrarla sobre el lienzo con `T`. La referencia no se incluye en el PNG exportado.
- Proyectos: usa **Guardar proyecto** para descargar un archivo `.beadstudio`. **Abrir proyecto** restaura las cuentas, dimensiones, fondo, simetría, color activo y referencia para poder seguir editando.
- Exportación: PNG transparente o con fondo de color.
