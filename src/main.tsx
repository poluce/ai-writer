import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { alertError } from './components/ui/AlertDialog'
import { confirm } from './components/ui/Confirm'
import { setDialogPort } from './shared/dialog-port'
import './index.css'

// Store/Service 通过 dialog-port Seam 反馈 UI；组合根在此注入真实弹窗实现。
setDialogPort({ alertError, confirm })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackLabel="应用程序遇到了意外错误">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
