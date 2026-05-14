import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./styles.css"

// Sync dark mode with system preference
const mq = window.matchMedia("(prefers-color-scheme: dark)")
const applyTheme = () => {
  document.documentElement.dataset.theme = mq.matches ? "dark" : "light"
}
applyTheme()
mq.addEventListener("change", applyTheme)

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
