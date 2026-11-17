import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PadWindowApp from './components/PadWindowApp.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    {/* The notepad's own window (outside the app window) is this same page, told so by its address. */}
    {location.hash === '#notepad' ? <PadWindowApp /> : <App />}
  </React.StrictMode>
)
