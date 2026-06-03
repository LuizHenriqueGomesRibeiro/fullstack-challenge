import { createFileRoute } from '@tanstack/react-router'
import AboutPage from './index'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})
