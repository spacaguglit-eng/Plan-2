import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App.jsx'
import './index.css'
import { SyncProvider } from '../context/SyncContext.jsx'
import { DataProvider } from '../context/DataContext.jsx'
import { NotificationProvider } from '../components/common/Toast.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
    mutations: { retry: 0 }
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <SyncProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </SyncProvider>
      </NotificationProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
