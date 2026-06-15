<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{ spec: string }>()
const host = ref<HTMLElement | null>(null)

onMounted(async () => {
  // swagger-ui-dist usa `window`, então só carrega no client (onMounted).
  const SwaggerUI = (await import('swagger-ui-dist/swagger-ui-es-bundle.js')).default
  await import('swagger-ui-dist/swagger-ui.css')
  SwaggerUI({
    url: props.spec,
    domNode: host.value,
    deepLinking: true,
    docExpansion: 'list',
    tryItOutEnabled: true,
    persistAuthorization: true,
  })
})
</script>

<template>
  <ClientOnly>
    <div ref="host" class="swagger-host" />
  </ClientOnly>
</template>

<style>
/* Swagger UI traz fundo branco próprio; garante legibilidade no tema escuro do VitePress. */
.swagger-host {
  margin-top: 1rem;
  background: #fff;
  border-radius: 8px;
}
.swagger-host .swagger-ui {
  padding: 0.5rem;
}
</style>
