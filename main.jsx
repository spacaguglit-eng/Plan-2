import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { DataProvider } from './context/DataContext.jsx'
import { NotificationProvider } from './components/common/Toast.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <DataProvider>
        <App />
      </DataProvider>
    </NotificationProvider>
  </React.StrictMode>,
)
