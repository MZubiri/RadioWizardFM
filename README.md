# 🧙‍♂️ WizardFM — Radio Mágica en Vivo

Radio online auto-hospedada con player web premium, chat en vivo, visualizador de audio y PWA instalable. Powered by AzuraCast + Docker.

![WizardFM](frontend/assets/logo.svg)

## ✨ Features

- 🎧 **Player de audio** con controles custom y visualizador de frecuencias
- 🔴 **Indicador EN VIVO** — detecta automáticamente cuando un DJ está transmitiendo
- 💬 **Chat en vivo** — WebSocket con nicknames, colores mágicos y moderación
- 📲 **PWA instalable** — se instala como app en Android/iOS
- 📜 **Historial de canciones** en tiempo real
- 📅 **Programación de shows**
- 🔔 **Notificaciones push** cuando un DJ entra en vivo
- 🎨 **Tema mágico** — glassmorphism, partículas flotantes, gradientes púrpura/dorado
- 📱 **Responsive** — se ve premium en cualquier dispositivo

## 🏗️ Arquitectura

```
WizardFM (este repo)          AzuraCast (instalación separada)
├── Frontend (Nginx)  ◄────►  API + Icecast Streaming
└── Chat (WebSocket)           AutoDJ + Web DJ
```

- **AzuraCast** maneja todo el streaming: Icecast, AutoDJ, playlists, cuentas de DJ
- **Este repo** es el frontend custom + chat server, deployado con Docker Compose via Coolify

## 🚀 Deploy con Coolify

### Prerequisitos

1. VPS con Ubuntu + Docker (Oracle Cloud, etc.)
2. [Coolify](https://coolify.io) instalado
3. [AzuraCast](https://www.azuracast.com/docs/getting-started/installation/) instalado por separado

### Pasos

1. **Instala AzuraCast** en tu VPS:
   ```bash
   mkdir -p /var/azuracast
   cd /var/azuracast
   curl -fsSL https://raw.githubusercontent.com/AzuraCast/AzuraCast/main/docker.sh > docker.sh
   chmod +x docker.sh
   ./docker.sh install
   ```

2. **Configura AzuraCast:**
   - Crea una estación llamada "WizardFM"
   - Habilita la API pública
   - Configura mount points (MP3 128kbps)
   - Crea cuentas de DJ

3. **Deploy este repo en Coolify:**
   - Agrega este repo como nuevo proyecto en Coolify
   - Configura las variables de entorno (ver `.env.example`)
   - Apunta `wizardfm.lat` al frontend
   - Apunta `radio.wizardfm.lat` al panel de AzuraCast

4. **Configura DNS:**
   ```
   wizardfm.lat       → A → [IP del VPS]
   radio.wizardfm.lat → A → [IP del VPS]
   ```

### Variables de Entorno

| Variable | Descripción | Default |
|:---|:---|:---|
| `AZURACAST_API_URL` | URL base de AzuraCast | `https://panel.wizardfm.lat` |
| `STREAM_URL` | URL del stream de Icecast | `https://panel.wizardfm.lat/listen/wizardfm/radio.mp3` |
| `STATION_ID` | ID / Shortcode de la estación en AzuraCast | `wizardfm` |
| `CHAT_PORT` | Puerto del WebSocket chat | `3001` |
| `MAX_HISTORY` | Mensajes de chat en memoria | `100` |
| `RATE_LIMIT_MS` | Rate limit de mensajes (ms) | `1000` |

## 🎧 Cómo Transmitir

### Opción 1: BUTT (Broadcast Using This Tool)
1. Descarga [BUTT](https://danielnoethen.de/butt/)
2. Configura el servidor:
   - **Address:** `radio.wizardfm.lat`
   - **Port:** `8000`
   - **Password:** (el que configuraste en AzuraCast)
   - **Mount:** `/radio`
   - **Type:** Icecast
3. Selecciona tu tarjeta de audio como input
4. Click "Play" para transmitir

### Opción 2: Mixxx
1. Descarga [Mixxx](https://mixxx.org)
2. Ve a Preferences → Live Broadcasting
3. Configura igual que BUTT
4. Mezcla tu música y transmite en vivo

### Opción 3: Web DJ (AzuraCast)
1. Entra a `radio.wizardfm.lat`
2. Login con tu cuenta de DJ
3. Click en "Web DJ" para transmitir desde el navegador

## 📁 Estructura del Proyecto

```
WizardFM/
├── docker-compose.yml        # Orquestación Docker
├── .env.example              # Variables de entorno
├── frontend/
│   ├── Dockerfile            # Nginx container
│   ├── nginx.conf            # Config Nginx
│   ├── index.html            # Player principal
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service Worker
│   ├── css/
│   │   └── style.css         # Estilos mágicos
│   ├── js/
│   │   ├── app.js            # Player + AzuraCast API
│   │   ├── chat.js           # Chat WebSocket client
│   │   ├── visualizer.js     # Visualizador de audio
│   │   └── notifications.js  # Push notifications
│   └── assets/
│       ├── logo.svg          # Logo
│       └── icons/            # PWA icons
└── server/
    ├── Dockerfile            # Node.js container
    ├── package.json
    └── chat-server.js        # WebSocket chat server
```

## 🛡️ Comandos de Admin (Chat)

| Comando | Descripción |
|:---|:---|
| `/ban <nickname>` | Banea a un usuario |
| `/mute <nickname>` | Silencia a un usuario |
| `/unmute <nickname>` | Dessilencia a un usuario |
| `/clear` | Limpia el historial del chat |

## ⌨️ Atajos de Teclado

| Atajo | Acción |
|:---|:---|
| `Espacio` | Play / Pause |
| `M` | Mute / Unmute |

## 📝 Licencia

MIT — Hecho con magia ✨
