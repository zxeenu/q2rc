import { isRouteErrorResponse, Link, Navigate, useLocation, useRouteError } from 'react-router'

// Where "/" ends up (see routes/router.jsx). If home itself throws,
// redirecting there would loop forever, so we show the error instead.
const HOME_PATHS = ['/', '/send']

export default function ErrorPage() {
  const error = useRouteError()
  const { pathname } = useLocation()
  console.error(error)

  if (!HOME_PATHS.includes(pathname.replace(/\/+$/, '') || '/')) {
    return <Navigate to="/" replace />
  }

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error'

  return (
    <main className="container">
      <h1>Something went wrong</h1>
      <p>{message}</p>
      <Link to="/">Go home</Link>
    </main>
  )
}
