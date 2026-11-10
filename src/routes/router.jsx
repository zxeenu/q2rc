import { createBrowserRouter, Navigate } from 'react-router'
import RootLayout from '../layouts/RootLayout.jsx'
import Send from '../pages/Send.jsx'
import Receive from '../pages/Receive.jsx'
import About from '../pages/About.jsx'
import NotFound from '../pages/NotFound.jsx'
import ErrorPage from '../pages/ErrorPage.jsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Navigate to="/send" replace /> },
      { path: 'send', element: <Send /> },
      { path: 'receive', element: <Receive /> },
      { path: 'about', element: <About /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
