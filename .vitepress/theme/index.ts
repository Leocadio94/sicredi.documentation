import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import SwaggerView from './components/SwaggerView.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SwaggerView', SwaggerView)
  },
} satisfies Theme
