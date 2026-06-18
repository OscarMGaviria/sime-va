<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Mountain,
  Milestone,
  Route,
  Droplet,
  Grid,
  Coins,
  Construction,
  Plane,
  GitMerge,
  Train,
  ArrowRight,
  Info
} from 'lucide-vue-next'

const router = useRouter()

const projects = [
  {
    id: 'toyo',
    name: 'Túnel del Toyo',
    poster: '/images/posters/Tunel del toyo.jpg',
    icon: Mountain,
    badge: 'Megaproyecto',
    desc: 'El túnel vial más largo de América, conectando a Medellín con el Urabá antioqueño.',
    stats: [{ label: 'Avance', val: '94%' }, { label: 'Longitud', val: '9.7 km' }]
  },
  {
    id: 'estabilizacion',
    name: 'Estabilización de Vías',
    poster: '/images/posters/Estabilizacion.jpeg',
    icon: Milestone,
    badge: 'Vías Terciarias',
    desc: 'Mantenimiento y estabilización de tramos viales críticos en las 9 subregiones.',
    route: { path: '/', query: { project: 'estabilizacion' } },
    stats: [{ label: 'Vías', val: '31' }, { label: 'Longitud', val: '634 km' }]
  },
  {
    id: 'tunel-oriente',
    name: 'Túnel de Oriente',
    poster: '/images/posters/Tunel Oriente.jpg',
    icon: Route,
    badge: 'Conectividad',
    desc: 'Segunda etapa de conexión del Valle de Aburrá con el Valle de San Nicolás.',
    stats: [{ label: 'Estado', val: 'Operación' }, { label: 'Túneles', val: '2' }]
  },
  {
    id: 'sable',
    name: 'Proyecto Sable (Acueducto)',
    poster: '/images/posters/sable.jpg',
    icon: Droplet,
    badge: 'Agua Potable',
    desc: 'Proyecto de acueducto y saneamiento básico para Turbo, Apartadó y Carepa en la subregión de Urabá.',
    stats: [{ label: 'Beneficiarios', val: '+250 mil' }, { label: 'Inversión', val: '1.8 billones' }]
  },
  {
    id: 'placa-huella',
    name: 'Placa Huella',
    poster: '/images/posters/Placa huella.jpeg',
    icon: Grid,
    badge: 'Comunitario',
    desc: 'Pavimentación de vías rurales para facilitar el transporte de productos del campo.',
    route: '/',
    stats: [{ label: 'Proyectos', val: '124' }, { label: 'Km construidos', val: '82 km' }]
  },
  {
    id: 'valorizacion',
    name: 'Valorización',
    poster: '/images/posters/valorizacion.png',
    icon: Coins,
    badge: 'Financiamiento',
    desc: 'Obras de infraestructura vial financiadas mediante contribución de valorización.',
    stats: [{ label: 'Recaudo', val: '91%' }, { label: 'Obras', val: '12' }]
  },
  {
    id: 'puentes',
    name: 'Puentes',
    poster: '/images/posters/puentes.png',
    icon: Construction,
    badge: 'Estructuras',
    desc: 'Construcción y mantenimiento de puentes vehiculares y peatonales de la red departamental.',
    route: { path: '/', query: { project: 'puentes' } },
    stats: [{ label: 'Construidos', val: '15' }, { label: 'En diseño', val: '6' }]
  },
  {
    id: 'intercambio-aeropuerto',
    name: 'Intercambio Vial Aeropuerto',
    poster: '/images/posters/Intercanvio aeropuerto.jpg',
    icon: Plane,
    badge: 'Infraestructura',
    desc: 'Solución a nivel y desnivel para el flujo vial en la glorieta externa del Aeropuerto JMC.',
    stats: [{ label: 'Avance', val: '86%' }, { label: 'Inversión', val: 'Alta' }]
  },
  {
    id: 'intercambio-sancho-paisa',
    name: 'Intercambio Sancho Paisa',
    poster: '/images/posters/sancho_paisa.png',
    icon: GitMerge,
    badge: 'Flujo Vial',
    desc: 'Intercambio vial para mejorar la movilidad en el sector Sancho Paisa - Las Palmas.',
    stats: [{ label: 'Fase', val: 'Diseño' }, { label: 'Presupuesto', val: 'Aprobado' }]
  },
  {
    id: 'ferrocarril',
    name: 'Ferrocarril de Antioquia',
    poster: '/images/posters/ferrocarril.png',
    icon: Train,
    badge: 'Férreo',
    desc: 'Reactivación de la red férrea del departamento para transporte de carga y pasajeros.',
    stats: [{ label: 'Tramos', val: '3' }, { label: 'Distancia', val: '80 km' }]
  }
]

const activeInfoProject = ref(null)
const loadedImages = ref({})
const loading = ref(true)
const showCards = ref(false)

let airportMap = null

watch(activeInfoProject, (newProj) => {
  if (newProj && newProj.id === 'intercambio-aeropuerto') {
    nextTick(() => {
      initAirportMap()
    })
  } else {
    if (airportMap) {
      airportMap.remove()
      airportMap = null
    }
  }
})

function initAirportMap() {
  nextTick(() => {
    const container = document.getElementById('airport-map-container')
    if (!container) return

    airportMap = new maplibregl.Map({
      container: 'airport-map-container',
      style: {
        version: 8,
        sources: {
          base: {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap © CARTO'
          }
        },
        layers: [
          {
            id: 'base-layer',
            type: 'raster',
            source: 'base',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: [-75.436024, 6.176055], // Coordenadas del intercambio vial del aeropuerto
      zoom: 13.0 // Zoom ligeramente reducido para apreciar límites de municipios
    })

    airportMap.addControl(new maplibregl.NavigationControl(), 'top-right')

    airportMap.on('load', () => {
      // Cargar la capa de municipios de Antioquia usando ruta con BASE_URL
      airportMap.addSource('municipios', {
        type: 'geojson',
        data: import.meta.env.BASE_URL + 'data/municipios.geojson'
      })

      // Dibujar límites de los municipios (Igual al estilo del mapa principal)
      airportMap.addLayer({
        id: 'municipios-layer-line',
        type: 'line',
        source: 'municipios',
        paint: {
          'line-color': '#2d8653',
          'line-width': 0.8,
          'line-opacity': 0.5
        }
      })

      // Relleno suave para polígonos de municipios
      airportMap.addLayer({
        id: 'municipios-layer-fill',
        type: 'fill',
        source: 'municipios',
        paint: {
          'fill-color': '#2d8653',
          'fill-opacity': 0.07
        }
      })

      // Popup/Tooltip para mostrar los nombres de los municipios en hover
      const mpioPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12
      })

      // Escuchar eventos de mouse en la capa de municipios
      airportMap.on('mousemove', 'municipios-layer-fill', (e) => {
        airportMap.getCanvas().style.cursor = 'pointer'
        if (e.features && e.features.length > 0) {
          const prop = e.features[0].properties
          const rawName = prop.MPIO_NOMBR || ''
          if (rawName) {
            // Formatear a Sentence Case (Ej: RIONEGRO -> Rionegro)
            const formatted = rawName.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase())
            
            mpioPopup.setLngLat(e.lngLat)
              .setHTML(`<div style="font-family:\'Prompt\',sans-serif;font-size:11px;font-weight:600;color:#1e293b;padding:2px 4px;">${formatted}</div>`)
              .addTo(airportMap)
          }
        }
      })

      airportMap.on('mouseleave', 'municipios-layer-fill', () => {
        airportMap.getCanvas().style.cursor = ''
        mpioPopup.remove()
      })

      // Crear elemento HTML personalizado para el marcador de la glorieta pulsante
      const el = document.createElement('div')
      el.className = 'pulsing-bridge-marker'
      el.innerHTML = `
        <div class="marker-pulse-wrapper"></div>
        <svg width="32" height="32" viewBox="0 0 32 32" style="display: block; position: relative; z-index: 10;">
          <circle cx="16" cy="16" r="13" fill="#f59e0b" stroke="#ffffff" stroke-width="1.8" />
          <circle cx="16" cy="16" r="6.5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-dasharray="3,2" />
          <path d="M16 3 L16 8 M16 24 L16 29 M3 16 L8 16 M24 16 L29 16" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      `

      // Crear el popup para el hover (sin botones de cerrar para actuar como tooltip)
      const popup = new maplibregl.Popup({
        offset: 15,
        closeButton: false,
        closeOnClick: false
      }).setHTML('<div style="font-family:\'Prompt\',sans-serif;font-size:12px;font-weight:700;color:#f59e0b;padding:2px 4px;">Intercambio Vial Aeropuerto</div>')

      // Inicializar el marcador con el elemento de puente pulsante
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([-75.436024, 6.176055])
        .addTo(airportMap)

      // Eventos hover para mostrar/ocultar el tooltip del marcador y actualizar el municipio
      el.addEventListener('mouseenter', () => {
        popup.setLngLat([-75.436024, 6.176055]).addTo(airportMap)
      })

      el.addEventListener('mousemove', (e) => {
        const rect = airportMap.getContainer().getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const lngLat = airportMap.unproject([x, y])

        const features = airportMap.queryRenderedFeatures([x, y], {
          layers: ['municipios-layer-fill']
        })

        if (features && features.length > 0) {
          const prop = features[0].properties
          const rawName = prop.MPIO_NOMBR || ''
          if (rawName) {
            const formatted = rawName.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase())
            mpioPopup.setLngLat(lngLat)
              .setHTML(`<div style="font-family:\'Prompt\',sans-serif;font-size:11px;font-weight:600;color:#1e293b;padding:2px 4px;">${formatted}</div>`)
              .addTo(airportMap)
          }
        } else {
          mpioPopup.remove()
        }
      })

      el.addEventListener('mouseleave', () => {
        popup.remove()
        mpioPopup.remove()
      })
    })
  })
}

function onLoaderLeave() {
  showCards.value = true
}

onMounted(() => {
  const startTime = Date.now()
  let finished = false
  const triggerShow = () => {
    if (!finished) {
      finished = true
      loading.value = false
    }
  }

  // Fallback timeout: wait at most 1.5s so the user doesn't block on slow connections
  const timeoutId = setTimeout(triggerShow, 1500)

  const promises = projects.map(proj => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = resolve
      img.onerror = resolve
      img.src = proj.poster // Set src after setting onload
    })
  })

  Promise.all(promises).then(() => {
    clearTimeout(timeoutId)
    // Garantizar un mínimo de 700ms de carga para evitar destellos y permitir apreciar la animación
    const elapsedTime = Date.now() - startTime
    const remainingTime = Math.max(0, 700 - elapsedTime)
    setTimeout(triggerShow, remainingTime)
  })
})

function handleCardClick(proj) {
  if (proj.route) {
    router.push(proj.route)
  } else {
    activeInfoProject.value = proj
  }
}
</script>

<template>
  <div class="home-container">
    <!-- Full-screen page loader -->
    <Transition name="loader-fade" @after-leave="onLoaderLeave">
      <div v-if="loading" class="cards-loader-container">
        <div class="loader-ring">
          <svg viewBox="0 0 50 50" class="loader-svg">
            <circle class="loader-track" cx="25" cy="25" r="20" />
            <circle class="loader-arc"   cx="25" cy="25" r="20" />
          </svg>
        </div>
        <span class="loader-text">Cargando portafolio...</span>
      </div>
    </Transition>
    <!-- ── Cabecera (Hero) ── -->
    <header class="home-hero">
      <div class="hero-brand">
        <img src="/Escudo de armas 2.png" alt="Escudo de Antioquia" class="hero-logo" />
        <div class="hero-titles">
          <span class="hero-tagline">Secretaría de Infraestructura Física</span>
          <p class="hero-subtitle">Sistema de Información y Monitoreo de Infraestructura Vial (SIMEVA)</p>
        </div>
      </div>
      <div class="hero-decor">
        <div class="decor-circle"></div>
      </div>
    </header>

    <!-- ── Grid de Megaproyectos ── -->
    <main class="home-main">
      <div v-if="showCards" class="grid-header animate-header">
        <div class="header-badge">
          <span class="badge-dot"></span>
          Portafolio de Inversión
        </div>
        <h2 class="grid-title">
          Portafolio de <span class="text-highlight">Infraestructura Vial</span>
        </h2>
        <p class="grid-desc">
          Selecciona un proyecto para explorar su mapa georreferenciado o consultar su ficha técnica.
        </p>
        <div class="header-divider"></div>
      </div>

      <TransitionGroup
        v-if="showCards"
        name="card-stagger"
        tag="div"
        class="projects-grid"
        appear
      >
        <div
          v-for="(proj, idx) in projects"
          :key="proj.id"
          class="project-card"
          :style="{ '--index': idx }"
          @click="handleCardClick(proj)"
        >
          <!-- Hidden image preloader -->
          <img
            :src="proj.poster"
            style="display: none"
            @load="loadedImages[proj.id] = true"
          />

          <!-- Imagen del poster de fondo -->
          <div
            class="card-bg"
            :class="{ 'is-loaded': loadedImages[proj.id] }"
            :style="{ backgroundImage: `url('${proj.poster}')` }"
          ></div>
          
          <!-- Capa oscura gradiente para legibilidad -->
          <div class="card-overlay"></div>

          <!-- Contenido de la Card -->
          <div class="card-body">
            <div class="card-top">
              <span class="card-badge">{{ proj.badge }}</span>
              <div class="card-icon-wrap">
                <component :is="proj.icon" :size="16" class="card-icon" />
              </div>
            </div>

            <div class="card-middle">
              <h3 class="card-name">{{ proj.name }}</h3>
              <p class="card-desc">{{ proj.desc }}</p>
            </div>

            <div class="card-bottom">
              <!-- Mini Stats -->
              <div class="card-stats">
                <div v-for="(st, idx) in proj.stats" :key="idx" class="card-stat">
                  <span class="stat-lbl">{{ st.label }}</span>
                  <span class="stat-val">{{ st.val }}</span>
                </div>
              </div>

              <!-- Botón interactivo -->
              <div class="card-action">
                <span class="action-text">{{ proj.route ? 'Ver Mapa' : 'Detalles' }}</span>
                <ArrowRight :size="14" class="action-arrow" />
              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </main>

    <!-- ── Modal Ficha Técnica (Megaproyectos en diseño/desarrollo) ── -->
    <Transition name="modal-fade">
      <div v-if="activeInfoProject" class="modal-overlay" @click.self="activeInfoProject = null">
        
        <!-- Especial para Intercambio Aeropuerto (Mapa en pantalla casi completa con Header y Bordes Rectos) -->
        <div v-if="activeInfoProject.id === 'intercambio-aeropuerto'" class="airport-map-modal">
          <!-- Cabecera del Modal -->
          <header class="airport-modal-header">
            <div class="airport-header-left">
              <img src="/Escudo de armas 2.png" alt="Escudo de Antioquia" class="airport-header-logo" />
              <div class="airport-header-titles">
                <span class="airport-header-tagline">Secretaría de Infraestructura Física</span>
                <h2 class="airport-header-title">{{ activeInfoProject.name }}</h2>
              </div>
            </div>
            <button class="airport-header-close" @click="activeInfoProject = null">✕</button>
          </header>
          
          <!-- Contenido del Modal (Mapa + Barra Lateral) -->
          <div class="airport-modal-content">
            <div id="airport-map-container" class="airport-map-canvas"></div>
            
            <div class="airport-map-sidebar">
              <span class="modal-badge">{{ activeInfoProject.badge }}</span>
              <p class="airport-modal-desc">{{ activeInfoProject.desc }}</p>
              
              <div class="airport-modal-stats">
                <div v-for="(st, idx) in activeInfoProject.stats" :key="idx" class="airport-stat-card">
                  <span class="airport-stat-val">{{ st.val }}</span>
                  <span class="airport-stat-lbl">{{ st.label }}</span>
                </div>
              </div>

              <div class="airport-modal-notice">
                <div class="notice-icon">📍</div>
                <div class="notice-content">
                  <strong>Ubicación Georreferenciada:</strong> Glorieta de acceso al Aeropuerto Internacional José María Córdova (Rionegro).
                </div>
              </div>
              
              <button class="btn-airport-close" @click="activeInfoProject = null">Cerrar Ficha</button>
            </div>
          </div>
        </div>

        <!-- Estándar para otros megaproyectos -->
        <div v-else class="project-modal">
          <button class="modal-close" @click="activeInfoProject = null">✕</button>
          
          <div class="modal-cover" :style="{ backgroundImage: `url('${activeInfoProject.poster}')` }">
            <div class="modal-cover-overlay"></div>
            <div class="modal-cover-content">
              <span class="modal-badge">{{ activeInfoProject.badge }}</span>
              <h2 class="modal-title">{{ activeInfoProject.name }}</h2>
            </div>
          </div>

          <div class="modal-body">
            <div class="modal-section">
              <h4 class="section-title"><Info :size="14" /> Descripción General</h4>
              <p class="section-text">{{ activeInfoProject.desc }}</p>
            </div>

            <div class="modal-section">
              <h4 class="section-title">Indicadores Clave</h4>
              <div class="modal-stats">
                <div v-for="(st, idx) in activeInfoProject.stats" :key="idx" class="modal-stat-card">
                  <span class="modal-stat-val">{{ st.val }}</span>
                  <span class="modal-stat-lbl">{{ st.label }}</span>
                </div>
              </div>
            </div>

            <div class="modal-notice">
              <div class="notice-icon">⚠️</div>
              <div class="notice-content">
                <strong>Mapeo en Integración:</strong> La visualización geográfica y el cargador de GeoJSON para este megaproyecto están en proceso de estructuración técnica.
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-modal-close" @click="activeInfoProject = null">Cerrar Ficha</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Logo Flotante Animado (A Toda Máquina) -->
    <div class="floating-atm-logo">
      <img src="/A toda maquina.png" alt="A Toda Máquina" />
    </div>

    <!-- Footer de página -->
    <footer class="home-footer">
      <p>© 2026 Gobernación de Antioquia — Secretaría de Infraestructura Física</p>
    </footer>
  </div>
</template>

<style scoped>
.home-container {
  width: 100%;
  height: 100vh;
  height: 100dvh; /* use dynamic viewport height for mobile if supported */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background-color: #ffffff;
  font-family: 'Prompt', sans-serif;
  color: #1f2937;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* ── Cabecera ── */
.home-hero {
  background: #ffffff;
  padding: 16px 40px;
  position: relative;
  z-index: 20;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid #f1f5f9;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  z-index: 10;
}

.hero-logo {
  height: 54px;
  object-fit: contain;
}

.hero-titles {
  display: flex;
  flex-direction: column;
  border-left: 1.5px solid rgba(12, 60, 38, 0.15);
  padding-left: 20px;
}

.hero-tagline {
  color: #0c3c26; /* Verde bosque oscuro extraído de la imagen */
  font-size: 24px; /* Duplicado desde el original de 12px */
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  line-height: 1.15;
}

.hero-subtitle {
  color: #2d3748; /* Gris carbón oscuro extraído de la imagen */
  font-size: 12px;
  font-weight: 400;
  margin: 2px 0 0;
}

.hero-decor {
  position: absolute;
  right: -50px;
  top: -50px;
  width: 250px;
  height: 250px;
  pointer-events: none;
}

.decor-circle {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(11, 86, 64, 0.04) 0%, transparent 70%);
}

/* ── Main content ── */
.home-main {
  width: 100%;
  padding: 30px 40px;
  box-sizing: border-box;
}

.grid-header {
  margin-bottom: 36px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  position: relative;
}

.header-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background-color: rgba(11, 86, 64, 0.08);
  color: #0b5640;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  border: 1px solid rgba(11, 86, 64, 0.12);
}

.badge-dot {
  width: 6px;
  height: 6px;
  background-color: #10b981;
  border-radius: 50%;
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.5; }
}

.grid-title {
  font-size: 32px;
  font-weight: 800;
  color: #111827; /* Darker charcoal for premium typography */
  margin: 0 0 8px;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.text-highlight {
  color: #0b5640;
  background: linear-gradient(120deg, #0b5640 0%, #10b981 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.grid-desc {
  font-size: 15px;
  color: #4b5563;
  margin: 0;
  max-width: 650px;
  line-height: 1.5;
}

.header-divider {
  width: 80px;
  height: 4px;
  background: linear-gradient(90deg, #0b5640 0%, #10b981 100%);
  border-radius: 2px;
  margin-top: 18px;
}

/* ── Logo Flotante Animado ── */
.floating-atm-logo {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(11, 86, 64, 0.15);
  padding: 12px 28px;
  border-radius: 50px;
  box-shadow: 0 10px 25px rgba(11, 86, 64, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.3s ease, border-color 0.3s;
  animation: float-pulse 3s ease-in-out infinite;
}

.floating-atm-logo img {
  height: 72px;
  object-fit: contain;
}

.floating-atm-logo:hover {
  transform: scale(1.05) translateY(-4px);
  box-shadow: 0 15px 35px rgba(11, 86, 64, 0.25);
  border-color: #0b5640;
  background: #ffffff;
}

@keyframes float-pulse {
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
  }
  100% {
    transform: translateY(0px);
  }
}

/* ── Grid ── */
.projects-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 24px;
  perspective: 1200px; /* Habilitar perspectiva 3D para una entrada premium */
}

@media (max-width: 1200px) {
  .projects-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ── Card ── */
.project-card {
  height: 380px;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background-color: #0b2619;
  transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.25s ease;
}

.project-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 28px rgba(11, 86, 64, 0.16);
}

.project-card:active {
  transform: translateY(-2px) scale(0.98);
  box-shadow: 0 6px 14px rgba(11, 86, 64, 0.1);
  transition-duration: 80ms; /* Fast press response */
}

.card-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0;
  transition: transform 0.5s ease, opacity 0.6s cubic-bezier(0.25, 1, 0.5, 1);
}

.card-bg.is-loaded {
  opacity: 1;
}

.project-card:hover .card-bg {
  transform: scale(1.04);
}

.card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(11, 38, 25, 0.95) 0%, rgba(11, 38, 25, 0.6) 40%, rgba(0, 0, 0, 0.1) 100%);
  transition: opacity 0.25s ease;
}

.project-card:hover .card-overlay {
  background: linear-gradient(to top, rgba(8, 48, 30, 0.98) 0%, rgba(8, 48, 30, 0.7) 45%, rgba(0, 0, 0, 0.15) 100%);
}

.card-body {
  position: relative;
  z-index: 10;
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-badge {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.card-icon-wrap {
  width: 28px;
  height: 28px;
  background: #16a34a;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-icon {
  color: #ffffff;
}

.card-middle {
  margin-top: auto;
  margin-bottom: 20px;
}

.card-name {
  font-size: 20px;
  font-weight: 800;
  margin: 0 0 6px;
  line-height: 1.2;
}

.card-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  padding-top: 14px;
}

.card-stats {
  display: flex;
  gap: 16px;
}

.card-stat {
  display: flex;
  flex-direction: column;
}

.stat-lbl {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  font-weight: 600;
}

.stat-val {
  font-size: 13px;
  font-weight: 700;
  color: #f59e0b;
}

.card-action {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #a7f3d0;
  transition: transform 0.2s ease;
}

.project-card:hover .action-arrow {
  transform: translateX(4px);
}

.action-arrow {
  transition: transform 0.2s ease;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.project-modal {
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 20;
  background: rgba(0, 0, 0, 0.3);
  border: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.modal-close:hover {
  background: rgba(0, 0, 0, 0.5);
}

.modal-cover {
  height: 180px;
  background-size: cover;
  background-position: center;
  position: relative;
  display: flex;
  align-items: flex-end;
  padding: 24px;
  box-sizing: border-box;
}

.modal-cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 100%);
}

.modal-cover-content {
  position: relative;
  z-index: 10;
  color: #ffffff;
}

.modal-badge {
  background: #16a34a;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.modal-title {
  font-size: 24px;
  font-weight: 900;
  margin: 6px 0 0;
  line-height: 1.1;
}

.modal-body {
  padding: 24px;
  box-sizing: border-box;
}

.modal-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 12px;
  text-transform: uppercase;
  color: #0b5640;
  margin: 0 0 8px;
  font-weight: 700;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-text {
  font-size: 13.5px;
  line-height: 1.5;
  color: #4b5563;
  margin: 0;
}

.modal-stats {
  display: flex;
  gap: 16px;
}

.modal-stat-card {
  flex: 1;
  background: #f0fdf4;
  border: 1px solid #d1fae5;
  padding: 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.modal-stat-val {
  font-size: 18px;
  font-weight: 800;
  color: #0b5640;
}

.modal-stat-lbl {
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  font-weight: 600;
  margin-top: 2px;
}

.modal-notice {
  display: flex;
  gap: 12px;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.4;
  color: #92400e;
}

.notice-icon {
  font-size: 16px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
}

.btn-modal-close {
  background: #0b5640;
  color: #ffffff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-family: 'Prompt', sans-serif;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s ease-out;
}

.btn-modal-close:hover {
  background: #094734;
}

.btn-modal-close:active {
  transform: scale(0.97);
}

/* ── Marcador Pulsante de Puente (Estilo de Puentes) ── */
:global(.pulsing-bridge-marker) {
  width: 32px;
  height: 32px;
  position: relative;
  cursor: pointer;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
  transition: transform 0.15s ease;
}

:global(.pulsing-bridge-marker:hover) {
  transform: scale(1.15);
}

:global(.marker-pulse-wrapper) {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background-color: #f59e0b;
  animation: bridge-marker-pulse-ring 1.8s infinite ease-out;
  z-index: 1;
}

@keyframes bridge-marker-pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

/* Estilización para Tooltips de MapLibre en Modal */
:global(.maplibregl-popup-content) {
  border-radius: 6px !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08) !important;
  border: 1px solid #e2e8f0 !important;
  padding: 6px 12px !important;
  background: #ffffff !important;
}

:global(.maplibregl-popup-tip) {
  border-bottom-color: #ffffff !important;
  border-top-color: #ffffff !important;
  border-left-color: #ffffff !important;
  border-right-color: #ffffff !important;
}

/* ── Modal del Aeropuerto (Pantalla completa con Mapa, Header y Bordes Rectos) ── */
.airport-map-modal {
  background: #ffffff;
  border-radius: 0px; /* Bordes redondeados eliminados */
  width: 92vw;
  height: 90vh;
  height: 90dvh;
  display: flex;
  flex-direction: column; /* Cambiado a vertical para colocar el header arriba */
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.airport-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  height: 70px;
  box-sizing: border-box;
  z-index: 20;
}

.airport-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.airport-header-logo {
  height: 38px;
  object-fit: contain;
}

.airport-header-titles {
  display: flex;
  flex-direction: column;
}

.airport-header-tagline {
  font-size: 10px;
  font-weight: 700;
  color: #0c3c26;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.airport-header-title {
  font-size: 18px;
  font-weight: 850;
  color: #1e293b;
  margin: 0;
  line-height: 1.2;
}

.airport-header-close {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #64748b;
  transition: color 0.15s;
}

.airport-header-close:hover {
  color: #0f172a;
}

.airport-modal-content {
  display: flex;
  flex-direction: row;
  flex: 1;
  height: calc(100% - 70px);
  overflow: hidden;
}

.airport-map-canvas {
  flex: 1;
  height: 100%;
  background-color: #e5e7eb;
}

.airport-map-sidebar {
  width: 380px;
  height: 100%;
  background: #ffffff;
  padding: 32px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.05);
  z-index: 10;
  overflow-y: auto;
}

.airport-modal-desc {
  font-size: 13.5px;
  line-height: 1.5;
  color: #4b5563;
  margin: 0 0 24px;
}

.airport-modal-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.airport-stat-card {
  flex: 1;
  background: #f0fdf4;
  border: 1px solid #d1fae5;
  padding: 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.airport-stat-val {
  font-size: 20px;
  font-weight: 800;
  color: #0c3c26;
}

.airport-stat-lbl {
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  font-weight: 600;
  margin-top: 2px;
}

.airport-modal-notice {
  display: flex;
  gap: 12px;
  background: #eff6ff;
  border: 1px solid #dbeafe;
  padding: 14px 16px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.45;
  color: #1e40af;
  margin-bottom: 24px;
}

.btn-airport-close {
  background: #0c3c26;
  color: #ffffff;
  border: none;
  padding: 12px 20px;
  border-radius: 8px;
  font-family: 'Prompt', sans-serif;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s ease-out;
  margin-top: auto;
  text-align: center;
}

.btn-airport-close:hover {
  background: #08281a;
}

.btn-airport-close:active {
  transform: scale(0.98);
}

.home-footer {
  background-color: #ffffff;
  border-top: 1px solid #e5e7eb;
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
  margin-top: auto;
}

/* ── Transiciones ── */
/* Staggered Cards Entrance Animation (Ultra Smooth 3D Tilt Reveal) */
.card-stagger-enter-active {
  transition: opacity 1100ms cubic-bezier(0.16, 1, 0.3, 1), transform 1100ms cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(80ms + var(--index) * 70ms);
  transform-style: preserve-3d;
}

.card-stagger-enter-from {
  opacity: 0;
  transform: translateY(24px) rotateX(4deg) scale(0.98);
}

.card-stagger-enter-to {
  opacity: 1;
  transform: translateY(0) rotateX(0deg) scale(1);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* Full-screen Loader for Home page */
.cards-loader-container {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.97); /* fondo blanco semi-transparente para combinar con el nuevo tema */
  backdrop-filter: blur(8px);
}

.loader-ring {
  width: 64px;
  height: 64px;
  filter: drop-shadow(0 4px 12px rgba(26, 92, 58, 0.35));
}

.loader-svg {
  width: 100%;
  height: 100%;
  animation: spin 1.4s linear infinite;
}

.loader-track {
  fill: none;
  stroke: #c8e6d4;
  stroke-width: 4;
}

.loader-arc {
  fill: none;
  stroke: #0b5640;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 80 45;
  animation: dash 1.4s ease-in-out infinite;
}

.loader-text {
  font-family: 'Prompt', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #0b5640;
  letter-spacing: 0.3px;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes dash {
  0% { stroke-dashoffset: 0; }
  50% { stroke-dashoffset: -50; }
  100% { stroke-dashoffset: -125; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.loader-fade-enter-active {
  transition: opacity 0.45s ease;
}

.loader-fade-leave-active {
  transition: opacity 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.loader-fade-enter-from,
.loader-fade-leave-to {
  opacity: 0;
}

/* Header Entrance Animation (Staggered Children Reveal) */
.animate-header .header-badge {
  animation: header-fade-slide-up 650ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 0ms;
}

.animate-header .grid-title {
  animation: header-fade-slide-up 650ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 80ms;
}

.animate-header .grid-desc {
  animation: header-fade-slide-up 650ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 160ms;
}

.animate-header .header-divider {
  animation: header-draw-divider 800ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 240ms;
}

@keyframes header-fade-slide-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes header-draw-divider {
  from {
    opacity: 0;
    width: 0px;
  }
  to {
    opacity: 1;
    width: 80px;
  }
}


/* ── Responsividad para Celulares ── */
@media (max-width: 768px) {
  .home-hero {
    padding: 14px 20px;
  }
  
  .hero-brand {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
  }
  
  .hero-logo {
    height: 42px;
  }
  
  .hero-titles {
    border-left: none;
    padding-left: 0;
    align-items: center;
  }
  
  .hero-tagline {
    font-size: 14px;
    line-height: 1.2;
  }
  
  .hero-subtitle {
    font-size: 12px;
    line-height: 1.3;
  }
  
  .home-main {
    padding: 24px 20px;
  }
  
  .grid-header {
    margin-bottom: 24px;
    align-items: center;
    text-align: center;
  }
  
  .grid-title {
    font-size: 24px;
  }

  .grid-desc {
    font-size: 13px;
  }

  .header-divider {
    margin: 14px auto 0;
  }
  
  .projects-grid {
    gap: 16px;
    grid-template-columns: repeat(1, 1fr);
  }
  
  .project-card {
    height: 340px;
  }
  
  .card-body {
    padding: 18px;
  }
  
  .card-name {
    font-size: 18px;
  }
  
  .floating-atm-logo {
    bottom: 16px;
    right: 16px;
    padding: 8px 16px;
    border-radius: 30px;
    box-shadow: 0 6px 16px rgba(11, 86, 64, 0.12);
  }
  
  .floating-atm-logo img {
    height: 42px;
  }
  
  .modal-overlay {
    padding: 12px;
  }
  
  .project-modal {
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }
  
  .modal-body {
    padding: 16px;
    overflow-y: auto;
  }
  
  .modal-cover {
    height: 140px;
    padding: 16px;
  }
  
  .modal-title {
    font-size: 20px;
  }
  
  .airport-map-modal {
    width: 98%;
    height: 95%;
    max-height: none;
    flex-direction: column; /* Se mantiene columna para colocar el header en la parte superior */
  }

  .airport-modal-content {
    flex-direction: column-reverse; /* El mapa arriba y sidebar abajo en móviles */
    height: calc(100% - 60px);
  }

  .airport-modal-header {
    height: 60px;
    padding: 10px 16px;
  }

  .airport-header-logo {
    height: 30px;
  }

  .airport-header-title {
    font-size: 14px;
  }

  .airport-map-sidebar {
    width: 100%;
    height: 45%;
    padding: 20px;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
  }
  
  .airport-modal-desc {
    margin-bottom: 16px;
  }
  
  .airport-modal-stats {
    margin-bottom: 16px;
  }
  
  .airport-modal-notice {
    margin-bottom: 16px;
    padding: 10px 12px;
    font-size: 11.5px;
  }

  .btn-airport-close {
    margin-top: 8px;
    padding: 10px 16px;
    font-size: 13px;
  }
}
</style>
