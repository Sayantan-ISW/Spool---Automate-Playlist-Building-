# 🎬 Spool - YouTube Playlist Builder

> Transform unstructured text into organized YouTube playlists automatically! 🚀

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Application](#-running-the-application)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [API Endpoints](#-api-endpoints)
- [Security Features](#-security-features)
- [Usage Guide](#-usage-guide)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

## 🌟 Overview

**Spool** (formerly Antigravity) is an intelligent web application that converts unstructured text containing YouTube video references, search queries, and topics into organized YouTube playlists. Simply paste your course notes, study guide, or any text with YouTube references, and let Spool do the heavy lifting!

### What It Does:

✨ **Extracts YouTube URLs** from various formats (youtube.com, youtu.be, shorts, embeds)  
🔍 **Identifies search queries** in quoted strings or with search directives  
📚 **Organizes by topics** detected from markdown headers, numbered lists, or topic markers  
🎯 **Creates playlists** directly in your YouTube account  
⚡ **Tracks API quota** to stay within YouTube's limits  
🔐 **Secure OAuth2** authentication with Google

## ✨ Features

- 🎨 **Modern Dark UI** with a custom design system
- 🤖 **Intelligent Text Parsing** using pattern recognition
- 🔗 **Multi-format URL Support** (standard, short, shorts, embeds)
- 📝 **Quoted Search Detection** with natural language processing
- 🎯 **Topic Segmentation** for organized playlists
- 👤 **Google Profile Integration** with custom avatars
- 📊 **Real-time Quota Tracking** to monitor API usage
- 🛡️ **Enterprise-grade Security** (Helmet, CSP, Rate Limiting)
- ⚡ **Serverless Ready** for Vercel deployment
- 🔄 **Auto Token Refresh** for seamless sessions

## 🛠️ Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **googleapis** - YouTube API client
- **dotenv** - Environment configuration
- **cookie-session** - Session management
- **helmet** - Security headers
- **express-rate-limit** - Rate limiting

### Frontend
- **Vanilla JavaScript** - No framework overhead
- **Space Grotesk** - Modern typography
- **Custom CSS** - Design system with CSS variables

### Deployment
- **Vercel** - Serverless hosting platform

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- ✅ **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- ✅ **npm** (comes with Node.js)
- ✅ **Google Cloud Console Account** - [Sign up](https://console.cloud.google.com/)
- ✅ **YouTube Account** (for testing)

## 🚀 Installation

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd YouTube-Playlist-Builder
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages:
- `express`, `googleapis`, `dotenv`
- `helmet`, `express-rate-limit`, `cookie-session`
- `nodemon` (dev dependency)

## ⚙️ Configuration

### Step 1: Create Google OAuth2 Credentials

1. 🌐 Go to [Google Cloud Console](https://console.cloud.google.com/)
2. 📁 Create a new project or select an existing one
3. 🔧 Enable the **YouTube Data API v3**:
   - Navigate to **APIs & Services** → **Library**
   - Search for "YouTube Data API v3"
   - Click **Enable**
4. 🛂 Configure the OAuth consent screen:
   - Go to **APIs & Services** → **OAuth consent screen**
   - Choose **External** (or Internal for workspace accounts)
   - Fill in app name, user support email, and developer contact
   - Add scopes: `../auth/youtube`, `../auth/userinfo.profile`, `../auth/userinfo.email`
   - Add test users (required for testing mode)
5. 🔑 Create OAuth2 credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Add authorized redirect URIs:
     - `http://localhost:3000/auth/callback` (for local development)
     - `https://yourdomain.com/auth/callback` (for production)
   - Save and copy the **Client ID** and **Client Secret**

### Step 2: Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Google OAuth2 Configuration
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Session Configuration
SESSION_SECRET=generate_random_32_character_hex_string_here

# Application Configuration
PORT=3000
NODE_ENV=development

# YouTube API Settings (Optional)
SEARCH_RESULTS_PER_QUERY=3
```

### Step 3: Generate Session Secret

Generate a secure session secret:

```bash
# On Windows PowerShell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# On macOS/Linux
openssl rand -hex 32
```

Copy the output and replace `generate_random_32_character_hex_string_here` in your `.env` file.

## 🏃 Running the Application

### Development Mode (with auto-restart)

```bash
npm run dev
```

The server will start at `http://localhost:3000` with nodemon watching for file changes.

### Production Mode

```bash
npm start
```

### Manual Start

```bash
node src/server.js
```

## 🌐 Deployment

### Deploying to Vercel

1. 📥 Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. 🔐 Login to Vercel:
   ```bash
   vercel login
   ```

3. ⚙️ Configure environment variables in Vercel:
   - Go to your project settings
   - Add all variables from `.env`
   - Update `GOOGLE_REDIRECT_URI` to your production URL

4. 🚀 Deploy:
   ```bash
   vercel --prod
   ```

The `vercel.json` configuration is already set up for serverless deployment.

### Important: Update OAuth Redirect URI

After deploying, add your production URL to Google Cloud Console:
- Go to **Credentials** → Your OAuth 2.0 Client ID
- Add `https://your-vercel-domain.vercel.app/auth/callback` to authorized redirect URIs

## 📁 Project Structure

```
YouTube-Playlist-Builder/
├── 📄 package.json           # Project dependencies and scripts
├── 📄 vercel.json           # Vercel deployment configuration
├── 📄 .env                  # Environment variables (not in repo)
├── 📁 api/
│   └── index.js             # Vercel serverless entry point
├── 📁 src/
│   ├── server.js            # Express app setup & middleware
│   ├── routes.js            # API route handlers
│   ├── auth.js              # Google OAuth2 logic
│   ├── youtube.js           # YouTube API service layer
│   ├── parser.js            # Text parsing & topic extraction
│   └── urlExtractor.js      # URL pattern matching
└── 📁 public/
    ├── index.html           # Main UI
    └── app.js              # Frontend JavaScript
```

### File Descriptions

| File | Purpose |
|------|---------|
| 🔒 `auth.js` | OAuth2 client creation, token management, auth middleware |
| 🎬 `youtube.js` | YouTube API wrapper with quota tracking & retry logic |
| 📝 `parser.js` | Intelligent text parsing for URLs, queries, and topics |
| 🔗 `urlExtractor.js` | Regular expressions for YouTube URL formats |
| 🛤️ `routes.js` | Express routes for auth, profile, playlist operations |
| 🖥️ `server.js` | Express server with security middleware |
| 🎨 `index.html` | Single-page application with design system |
| ⚡ `app.js` | Frontend logic: auth, text processing, API calls |

## 🔌 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/auth/login` | Redirects to Google OAuth consent |
| `GET` | `/auth/callback` | OAuth callback handler |
| `GET` | `/auth/status` | Check authentication status |
| `POST` | `/auth/logout` | Revoke tokens and clear session |

### User Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/profile` | Get user info, playlists, quota usage |
| `POST` | `/api/profile/avatar` | Update custom avatar |

### Playlist Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/parse` | Parse text and preview structure |
| `POST` | `/api/create-playlist` | Create YouTube playlist from text |

## 🛡️ Security Features

- 🔐 **OAuth2 Authentication** - Secure token-based auth
- 🪖 **Helmet.js** - Security headers (CSP, X-Frame-Options, etc.)
- 🚦 **Rate Limiting** - 100 requests per 15 minutes per IP
- 🍪 **Secure Cookies** - httpOnly, signed session cookies
- ⚖️ **Input Validation** - Size limits (100KB) on requests
- 🎭 **CORS Protection** - Same-origin policy enforcement
- 🔄 **Auto Token Refresh** - Handled by googleapis client
- 📊 **Quota Tracking** - Prevents API abuse

### Content Security Policy

The app enforces a strict CSP:
- Scripts: Self only
- Styles: Self + Google Fonts (inline for critical CSS)
- Images: Self + YouTube thumbnails + Google profile pics
- Fonts: Self + Google Fonts CDN

## 📖 Usage Guide

### 1️⃣ Sign In

Click the **"Sign in with Google"** button and authorize the app.

### 2️⃣ Prepare Your Text

Format your text with:
- 🔗 **YouTube URLs** (any format)
- 🔍 **Quoted search queries**: `"learn javascript in 2024"`
- 📚 **Topic markers**:
  - Markdown headers: `## Introduction`
  - Numbered lists: `1. Getting Started`
  - Topic labels: `Topic 1: Basics`

Example input:
```
## Module 1: JavaScript Basics
"javascript tutorial for beginners"
https://youtu.be/W6NZfCO5SIk

## Module 2: Advanced Concepts
"async await javascript"
"javascript closures explained"
https://www.youtube.com/watch?v=8aGhZQkoFbQ
```

### 3️⃣ Parse & Preview

Paste your text and click **"Parse Text"**. Review the detected:
- ✅ Topics
- ✅ Video URLs
- ✅ Search queries

### 4️⃣ Create Playlist

Enter a playlist name and click **"Create Playlist"**. The app will:
1. 🔍 Search YouTube for quoted queries (top 3 results each)
2. ✅ Validate all video IDs
3. 📝 Create the playlist in your YouTube account
4. ➕ Add all videos in order

### 5️⃣ Monitor Progress

Watch real-time updates:
- 🔄 Searching for videos...
- ✅ Creating playlist...
- 📊 API quota usage

## 🐛 Troubleshooting

### Common Issues

#### ❌ "OAuth callback error"
- ✅ Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- ✅ Check redirect URI matches exactly (including http/https)
- ✅ Ensure YouTube Data API v3 is enabled

#### ❌ "YouTube API quota exceeded"
- ✅ Check quota usage in Google Cloud Console
- ✅ Default quota is 10,000 units/day
- ✅ Request a quota increase if needed

#### ❌ "Session expired" errors
- ✅ Generate a new `SESSION_SECRET`
- ✅ Clear browser cookies
- ✅ Try logging out and back in

#### ❌ Port 3000 already in use
```powershell
# Windows PowerShell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force

# Or change PORT in .env
PORT=3001
```

#### ❌ CORS errors in production
- ✅ Verify Vercel domain matches OAuth redirect URI
- ✅ Check CSP settings in server.js

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. 🍴 Fork the repository
2. 🌿 Create a feature branch: `git checkout -b feature/amazing-feature`
3. 💾 Commit your changes: `git commit -m 'Add amazing feature'`
4. 📤 Push to the branch: `git push origin feature/amazing-feature`
5. 🎯 Open a Pull Request

### Code Style

- Use strict mode
- Follow existing patterns
- Add comments for complex logic
- Keep functions focused and small

## 📜 License

This project is provided as-is for educational purposes.

---

## 🙏 Acknowledgments

- 🎨 **Space Grotesk** font by Florian Karsten
- 🔧 **Google APIs** Node.js client
- 🛡️ **Express.js** ecosystem

## 📞 Support

For issues, questions, or suggestions:
- 📧 Open an issue on GitHub
- 📚 Check the [YouTube API documentation](https://developers.google.com/youtube/v3)
- 🌐 Visit [Google Cloud Console](https://console.cloud.google.com/)

---

**Made with ❤️ and lots of ☕**
