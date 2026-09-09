# Plan de trabajo: transmisor WizardFM

## 1. Objetivo

Crear una aplicación instalable para Windows que permita a un locutor transmitir a
WizardFM/AzuraCast con una experiencia sencilla, similar a Mixlr:

- capturar el audio que reproduce la PC;
- capturar un micrófono o interfaz de audio;
- mezclar ambas fuentes con volumen, mute y medidores independientes;
- codificar el resultado y enviarlo al acceso de DJ de AzuraCast;
- mostrar claramente los estados `FUERA DEL AIRE`, `CONECTANDO`, `EN VIVO` y
  `RECONECTANDO`;
- guardar perfiles y credenciales de forma segura.

El primer entregable será para Windows 10/11 x64. La arquitectura dejará aisladas
las funciones nativas para poder incorporar macOS, Android e iOS posteriormente.

## 2. Qué existe hoy en el repositorio

El repositorio actual contiene:

- un frontend web estático servido por Nginx;
- un reproductor que consume el stream público y la API Now Playing de AzuraCast;
- un panel web de locutores que muestra parámetros e instrucciones para usar BUTT
  o Mixxx;
- un backend Node.js/Socket.IO para chat, programación y acceso al panel.

No existe todavía un componente que capture, mezcle, codifique o emita audio. El
transmisor será una nueva aplicación cliente; no debe ejecutarse dentro de los
contenedores del sitio web ni enviar el audio a través del servidor de chat.

También hay que distinguir dos direcciones:

- la URL `/listen/...` actual es para **oyentes**;
- la app necesita el servidor, puerto, mount, usuario y contraseña indicados en
  **Streamers/DJ Accounts > Connection Information** de AzuraCast.

## 3. Alcance del MVP de Windows

### Incluido

1. Un perfil de estación WizardFM editable.
2. Prueba de conexión sin iniciar una transmisión pública prolongada.
3. Selección de salida de Windows a capturar mediante WASAPI loopback.
4. Selección de micrófono o interfaz de entrada.
5. Mezcla estéreo interna a 48 kHz, con conversión automática cuando un dispositivo
   trabaje a otra frecuencia o tenga otro número de canales.
6. Ganancia, mute, medidor RMS/pico y aviso de clipping por fuente.
7. Ganancia master y limitador de seguridad.
8. Codificación compatible con la entrada en vivo de Liquidsoap/AzuraCast.
9. Envío como fuente Icecast 2 con autenticación de locutor.
10. Botón único para iniciar/detener, cronómetro, calidad de conexión, bitrate y
    contador de reconexiones.
11. Reconexión automática con espera incremental ante cortes breves.
12. Seguimiento de Now Playing para confirmar qué locutor figura al aire.
13. Preferencias locales y contraseña en Windows Credential Manager.
14. Logs exportables, sin contraseñas ni cabeceras de autenticación.
15. Instalador de Windows y mecanismo de actualización preparado, aunque la
    actualización automática puede activarse después de la beta.

### Fuera del MVP

- reproductor de archivos, playlists o consola DJ completa;
- invitados remotos, llamadas o mezcla de video;
- efectos VST, ecualizador avanzado o compresor multibanda;
- grabación local;
- múltiples estaciones simultáneas;
- emisión a varios servidores al mismo tiempo;
- captura individual por aplicación de Windows;
- paridad total de captura de audio del sistema en móviles.

Estos puntos pueden añadirse sin cambiar el flujo principal, pero incluirlos en la
primera versión retrasaría la validación más importante: una transmisión estable.

## 4. Arquitectura recomendada

### Tecnologías

- **Shell/UI:** Tauri 2 + React + TypeScript + Vite.
- **Motor:** Rust, independiente de la interfaz.
- **Windows:** WASAPI/MMDevice para enumeración, micrófono y loopback.
- **Audio interno:** PCM `f32`, estéreo, 48 kHz; buffers circulares separados por
  fuente; remuestreo antes de mezclar.
- **Salida:** Icecast 2 hacia el puerto de locutores de AzuraCast.
- **Estado de estación:** API pública y WebSocket Now Playing de AzuraCast.
- **Secretos:** almacén seguro nativo del sistema operativo.

Antes de fijar la biblioteca de producción se hará un spike comparando dos rutas de
salida:

1. Ogg Vorbis + cliente Icecast, que evita distribuir un codificador MP3 y que
   Liquidsoap puede transcodificar a los mounts públicos.
2. MP3 CBR mediante LAME + cliente Icecast, si la prueba de compatibilidad, calidad
   y distribución/licencia resulta más conveniente.

No se debe construir la UI completa hasta haber sostenido una emisión real con la
ruta elegida durante al menos dos horas.

### Flujo de audio

```text
Salida de Windows -- WASAPI loopback --\
                                      +-- resample -- mixer -- limiter -- encoder
Micrófono --------- WASAPI capture ---/                         |
                                                               v
                                                     Icecast source client
                                                               |
                                                               v
                                                   AzuraCast / Liquidsoap
                                                               |
                                                               v
                                                       mounts de oyentes
```

La UI nunca procesará audio. Sólo enviará comandos y recibirá eventos/mediciones
del motor. Esto evita saltos cuando el WebView repinta y permite probar el audio sin
abrir una ventana.

### Estructura propuesta

```text
WizardFM/
├── apps/
│   └── broadcaster/
│       ├── src/                  # React/TypeScript
│       └── src-tauri/            # integración Tauri
├── crates/
│   ├── audio-core/               # buffers, resample, mixer, meters, limiter
│   ├── stream-output/            # encoder, Icecast y reconexión
│   ├── platform-windows/         # WASAPI y Credential Manager
│   └── station-client/           # perfiles y Now Playing
├── frontend/                     # sitio web actual, sin cambios de función
├── server/                       # chat/programación actuales
└── docs/
```

Las interfaces nativas clave serán `AudioCaptureBackend`, `SecretStore` y
`AppLifecycle`. macOS, Android e iOS implementarán esas interfaces sin duplicar el
mezclador ni el cliente de streaming.

## 5. Diseño funcional de la interfaz

### Pantalla principal

```text
┌ WizardFM Broadcaster ─ Estación: WizardFM ─ Red: estable ┐
│                                                          │
│  AUDIO DE LA PC                    MICRÓFONO              │
│  [Dispositivo           v]        [Dispositivo        v] │
│  L ▮▮▮▮▮▯▯  R ▮▮▮▮▯▯▯             L ▮▮▮▯▯▯▯  R ▮▮▮▯▯▯▯  │
│  [Mute]  ─────●────  0 dB         [Mute] ───●──── -3 dB │
│                                                          │
│  MASTER  L ▮▮▮▮▮▯▯  R ▮▮▮▮▯▯▯    Sin clipping          │
│                                                          │
│  AutoDJ activo                   00:00:00                 │
│               [   INICIAR TRANSMISIÓN   ]                │
└──────────────────────────────────────────────────────────┘
```

Principios:

- el botón de emisión es la acción dominante;
- el color rojo sólo significa que realmente se está al aire, no que se está
  intentando conectar;
- cada error ofrece una acción concreta: revisar credenciales, puerto, dispositivo
  desconectado o conexión de red;
- la configuración avanzada queda en una pantalla secundaria;
- el estilo reutiliza colores, logo y variables visuales del sitio WizardFM.

### Ajustes

- **Estación:** servidor, puerto, TLS, mount, usuario y contraseña.
- **Audio:** frecuencia interna, canales, tamaño de buffer y dispositivo de
  monitoreo.
- **Emisión:** códec, bitrate y política de reconexión.
- **Diagnóstico:** versiones, prueba de red, dispositivos detectados y exportación
  de logs.

El monitoreo del micrófono estará apagado por defecto. Si se activa, se exigirá una
salida distinta o audífonos para evitar realimentación. La app también advertirá
que reproducir el stream público en la misma PC entra en el loopback y puede crear
un eco o bucle.

## 6. Fases y entregables

### Fase 0 — Descubrimiento y prueba técnica (semana 1)

- obtener de AzuraCast los datos reales de Connection Information;
- confirmar si el puerto de locutores es accesible directamente o está detrás de
  Cloudflare/proxy;
- emitir a una estación de prueba con usuario DJ dedicado;
- prototipo sin UI: loopback + micrófono + mezcla + encoder + Icecast;
- prueba continua de dos horas;
- decisión documentada de códec/bibliotecas y revisión de licencias.

**Salida:** demo de consola que se escucha en un mount de prueba y reporte de
latencia, CPU, memoria, cortes y calidad.

### Fase 1 — Base de la aplicación (semana 2)

- crear el workspace de Tauri/Rust/React;
- definir contratos entre UI, motor y adaptadores nativos;
- perfiles de estación y almacenamiento seguro;
- pipeline de CI para compilar y probar Windows;
- pruebas unitarias de configuración y máquina de estados.

**Salida:** app instalable que abre, guarda un perfil y prueba credenciales.

### Fase 2 — Motor de audio Windows (semanas 3 y 4)

- enumeración y cambio de dispositivos;
- captura WASAPI loopback y micrófono en hilos separados;
- normalización de canales, remuestreo y sincronización de relojes;
- mixer, faders, mute, medidores y limitador;
- manejo de silencio, underruns, cambio del dispositivo predeterminado y hot-plug;
- pruebas del motor con fuentes de audio sintéticas.

**Salida:** mezcla local estable y medible, aún sin depender de la UI final.

### Fase 3 — Emisión a AzuraCast (semana 5)

- encoder seleccionado en la Fase 0;
- sesión Icecast 2, autenticación y timeouts;
- estados de conexión y cancelación limpia;
- reconexión incremental con límite y control manual;
- métricas de bytes, bitrate efectivo y cola de audio;
- integración de Now Playing para verificar el estado en vivo.

**Salida:** transmisor funcional de punta a punta.

### Fase 4 — Experiencia tipo Mixlr (semanas 6 y 7)

- implementar pantalla principal, ajustes y diagnóstico;
- medidores fluidos sin bloquear el motor;
- selector de dispositivos con nombres comprensibles;
- confirmaciones para iniciar/detener y prevención de doble clic;
- accesibilidad por teclado y escalado de Windows;
- integración visual con la marca WizardFM.

**Salida:** beta interna utilizable por locutores no técnicos.

### Fase 5 — Resiliencia y seguridad (semana 8)

- credenciales sólo en Windows Credential Manager;
- ocultar secretos y datos sensibles en UI y logs;
- recuperación ante Wi-Fi intermitente, suspensión y cambio de red;
- recuperación ante desconexión de USB/micrófono;
- watchdog de audio y detección de clipping/silencio prolongado;
- modelo de permisos/capabilities mínimo de Tauri.

**Salida:** release candidate con fallos recuperables y diagnóstico útil.

### Fase 6 — QA, piloto y distribución (semanas 9 y 10)

- matriz de hardware y versiones de Windows;
- pruebas de 2, 4 y 8 horas;
- piloto con 2–3 locutores;
- instalador NSIS/MSI, desinstalación y migración de ajustes;
- firma de código para la publicación pública;
- manual breve y guía de solución de problemas;
- correcciones del piloto y versión `1.0.0`.

**Salida:** primera versión pública para Windows.

Estimación: **10 semanas para una persona con experiencia en audio nativo y Rust**.
Con incertidumbre de hardware, certificados y códec, conviene reservar 2 semanas de
contingencia. Una prueba conceptual limitada puede estar lista al final de la
primera semana; no debe confundirse con una app lista para locutores.

## 7. Criterios de aceptación de la versión 1.0

- captura simultánea de audio de PC y micrófono en Windows 10/11 x64;
- conexión correcta usando un usuario DJ de AzuraCast, sin API key administrativa;
- AutoDJ vuelve automáticamente al cortar la transmisión;
- medidores y controles corresponden al audio que llega al servidor;
- cero dropouts atribuibles a la app en una prueba de 8 horas;
- recuperación comprobada tras 30 segundos sin red;
- desconectar el micrófono no cierra ni congela la app;
- no aparecen contraseñas en archivos de configuración, consola o logs;
- consumo objetivo en una PC de referencia: menos de 10 % de CPU promedio y menos
  de 200 MB de RAM;
- instalador reproducible y firmado para la distribución pública;
- un locutor nuevo puede configurar y salir al aire con una guía de una página.

## 8. Matriz mínima de pruebas

| Área | Casos principales |
|---|---|
| Dispositivos | Realtek, USB, Bluetooth, mono, estéreo, 44.1/48 kHz |
| Cambios | predeterminado, conectar/desconectar USB, suspender/reanudar |
| Audio | silencio, clipping, distintas frecuencias, deriva de reloj |
| Red | DNS inválido, contraseña incorrecta, pérdida y retorno de Wi-Fi |
| AzuraCast | DJ ocupado, mount incorrecto, AutoDJ/live/AutoDJ |
| UI | 100–200 % DPI, teclado, ventana mínima, tema y errores largos |
| Duración | sesiones de 2, 4 y 8 horas |

Bluetooth debe documentarse con cuidado: el perfil manos libres suele reducir la
calidad cuando el mismo dispositivo se usa como salida y micrófono.

## 9. Seguridad e integración con el repositorio actual

La app debe usar cuentas individuales de Streamer/DJ de AzuraCast. No debe incluir
la contraseña en el instalador, un archivo `.env`, el servidor Node ni una URL de
configuración.

Antes de enlazar el panel web con la app conviene corregir por separado estos puntos
del código actual:

- la contraseña predeterminada del panel está escrita en el código y almacenada en
  texto plano;
- los tokens están sólo en memoria, no expiran y se pierden al reiniciar;
- las rutas CRUD de programación no comprueban el token;
- CORS de Socket.IO permite cualquier origen.

No impiden construir el transmisor porque éste se conectará directamente a
AzuraCast, pero sí bloquean una publicación segura del panel de administración.

Una integración posterior puede añadir un botón “Abrir WizardFM Broadcaster” con
un deep link que transfiera servidor, puerto y mount. El usuario y la contraseña no
deben viajar en ese enlace.

## 10. Portabilidad futura

### macOS

- reutiliza UI, mixer, encoder, conexión y configuración;
- implementa micrófono/Core Audio y captura de salida con Core Audio taps;
- requiere permisos de micrófono y grabación de audio del sistema;
- requiere firma, hardened runtime y notarización;
- estimación posterior: 4–6 semanas más QA en Intel y Apple Silicon.

Los Core Audio taps modernos requieren macOS 14.2 o posterior. Dar soporte a
versiones anteriores probablemente exigiría un dispositivo virtual, que debe
tratarse como otro proyecto.

### Android

- primera versión: micrófono e interfaz USB, emisión en foreground service;
- captura de otras apps sólo desde Android 10 y sólo cuando esas apps permiten ser
  capturadas;
- requiere MediaProjection, notificación persistente y tratamiento agresivo de
  cambios de red/batería;
- estimación posterior: 5–8 semanas.

### iOS

- primera versión: micrófono/interfaz de audio y background audio;
- no se debe prometer captura general del audio de otras apps;
- ReplayKit captura audio de la propia app/micrófono bajo sus reglas, no equivale
  al loopback global de Windows;
- requiere una integración Swift, permisos, firma y revisión de App Store;
- estimación posterior: 6–8 semanas.

La promesa multiplataforma debe ser “transmitir desde cualquier dispositivo”. La
captura completa de todo el audio del sistema sólo puede ofrecerse donde el sistema
operativo lo permita.

## 11. Decisiones necesarias antes de comenzar

1. Confirmar si el MVP será sólo para WizardFM o permitirá cualquier AzuraCast.
2. Elegir Windows mínimo: se recomienda Windows 10 versión 1903 o posterior y
   Windows 11.
3. Obtener un usuario DJ y una estación/mount de pruebas separados de producción.
4. Confirmar el acceso directo al puerto de locutores y si exige TLS.
5. Decidir si la beta será interna sin firma o pública y firmada.
6. Definir dos o tres PCs/interfaces que representen el hardware real de los
   locutores.

## 12. Fuentes técnicas

- [AzuraCast: Streamers & DJs](https://www.azuracast.com/docs/user-guide/streamers-and-djs/)
- [AzuraCast: Streaming Software](https://www.azuracast.com/docs/user-guide/streaming-software/)
- [AzuraCast: Now Playing Data APIs](https://www.azuracast.com/docs/developers/now-playing-data/)
- [Microsoft: WASAPI](https://learn.microsoft.com/en-us/windows/win32/coreaudio/wasapi)
- [Microsoft: Loopback Recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- [Tauri 2: What is Tauri?](https://v2.tauri.app/start/)
- [Tauri 2: Distribution](https://v2.tauri.app/distribute/)
- [Apple: Core Audio taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps)
- [Android: AudioPlaybackCaptureConfiguration](https://developer.android.com/reference/android/media/AudioPlaybackCaptureConfiguration)
- [Apple: ReplayKit](https://developer.apple.com/documentation/replaykit)
