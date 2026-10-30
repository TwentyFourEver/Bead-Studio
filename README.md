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
- Simetría: lateral, arriba/abajo o ambos ejes. Arrastra el botón de flechas de cada línea o usa los deslizadores del panel lateral para mover el eje; **Centrar ejes** restaura el centro. Los ejes se ajustan a la retícula y su posición se conserva al guardar, abrir, deshacer y cambiar de tamaño el patrón.
- Guía numerada: activa **Numerar pasos** o pulsa `N`. En modo **Manual**, añade pasos con clic o arrastre entre las cuentas; para eliminarlos, usa clic derecho o arrastre con el botón derecho. En modo **Automática**, la aplicación detecta las cruces completas de cuatro cuentas y las numera horizontalmente por filas: la primera de derecha a izquierda, la siguiente de izquierda a derecha y así sucesivamente. El primer paso marca el inicio y puedes cambiar al modo manual para corregir el orden. La guía puede ocultarse sin borrarla; su visibilidad se guarda en el proyecto y determina si aparece en el PNG.
- Referencia: los controles también están en el panel lateral y se abren con el botón **Ver referencia** del lienzo, incluso en pantalla completa. Abre **Tomar un color de la imagen** para reemplazar el color del espacio activo con un tono recomendado. Carga una imagen en una ventana flotante, movible y redimensionable, para verla mientras dibujas; su botón **Estirar** permite ajustar ancho y alto libremente al redimensionar la ventana. Desde el panel puedes cambiar al modo Calcado, ajustar opacidad, tamaño y posición, o arrastrarla sobre el lienzo con `T`. La referencia no se incluye en el PNG exportado.
- Convertir imagen: carga un diseño digital PNG, JPEG o WebP desde **Convertir imagen**. La aplicación calibra automáticamente la tolerancia del fondo, detecta localmente las cuentas, descarta el fondo y las anotaciones y muestra una vista previa editable. En **Colores que quiero usar**, marca uno o varios de tus 12 espacios y edita sus colores si hace falta: las cuentas, incluidas las correcciones manuales, usan solo esos colores exactos. Cambiar la selección actualiza la vista previa sin perder los tonos originales. Debe quedar al menos un color seleccionado. La tolerancia se puede corregir con el deslizador o volver a calcular con **Autoajustar**. El resultado reserva cinco posiciones vacías por cada lado; la imagen original queda como referencia flotante y toda la importación se puede deshacer con `Ctrl+Z`.
- Proyectos: usa **Guardar proyecto** para descargar un archivo `.beadstudio`. **Abrir proyecto** restaura las cuentas, dimensiones, fondo, simetría, color activo y referencia para poder seguir editando.
- Exportación: elige entre imagen PNG o GIF animado. El PNG se mantiene transparente o con fondo de color y, si la guía está visible, incluye sus números sin las líneas. El GIF muestra los números y anima las líneas del recorrido.
- Pantalla completa: usa el botón de las cuatro esquinas junto a los controles de zoom para ampliar el área del lienzo; pulsa `Esc` para salir.

- Cuentas vacías adyacentes: el panel lateral permite marcar en rojo los vecinos sin pintar y muestra cuántas cuentas conviene revisar. Las recomendaciones se actualizan al pintar, borrar o mover cuentas; puedes ocultarlas con **Marcar en rojo**.
- Guía de botones y atajos: todos los atajos están reunidos en el panel lateral, disponible también en pantalla completa. Incluye `V` para selección y `T` para mover la referencia en Calcado.

- Paleta personal: **Mis colores** tiene siempre 12 espacios en cuatro columnas y tres filas. Haz doble clic en un color para abrir el selector y reemplazarlo; también puedes seleccionar un espacio y pulsar **Editar**. Pintar, importar imágenes y limpiar el patrón no añaden colores. Recargar la página conserva los espacios y los proyectos también incluyen la paleta; las paletas antiguas se adaptan a 12 espacios sin cambiar las cuentas ya pintadas.
- Ajustar el calcado: arrastra las esquinas de la imagen para cambiar su tamaño o los puntos de los lados para estirar solo el ancho o el alto. **Mantener proporciones** conserva la relación entre ancho y alto al usar las esquinas; desactívalo para estirar libremente desde ellas. También puedes escribir los porcentajes de **Estirar ancho** y **Estirar alto**, y recuperar la forma original con **Restablecer proporciones**. Cada arrastre se puede deshacer con `Ctrl+Z` y sus dimensiones se guardan en el proyecto.
