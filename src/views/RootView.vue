<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import HomeView from './HomeView.vue'
import App from '../App.vue'

const route = useRoute()
const showMap = computed(() => {
  return !!route.query.project
})
</script>

<template>
  <div class="root-wrapper">
    <Transition name="fade-slide" mode="out-in">
      <App v-if="showMap" :key="'map'" />
      <HomeView v-else :key="'home'" />
    </Transition>
  </div>
</template>

<style scoped>
.root-wrapper {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  position: relative;
}

/* Transición suave entre Home y Mapa */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: scale(0.99);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: scale(0.99);
}
</style>
