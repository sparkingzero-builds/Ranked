import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { captureToken } from './anilistAuth.js'
import './styles.css'
import './theme.css'
captureToken() // AniList login redirect lands back here with #access_token
createRoot(document.getElementById('root')).render(<App />)
// installable app: offline shell (production only, so dev hot-reload isn't cached)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
