import { Navigate, Route, Routes } from 'react-router-dom'
import { BreakPreviewPage } from './routes/BreakPreviewPage'
import { HomePage } from './routes/HomePage'
import { JoinPage } from './routes/JoinPage'
import { RoomPage } from './routes/RoomPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/preview/break-order" element={<BreakPreviewPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
