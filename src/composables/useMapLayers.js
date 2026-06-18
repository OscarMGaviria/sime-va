import { ref, onUnmounted, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import { getLocalizaciones, getMunicipios } from '../services/api.js'
import { pctTiempoTranscurrido } from '../utils/stats.js'
import { useMapStore } from '../stores/useMapStore.js'
import hitosData from '../data/hitos.json'

const normStr = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
const _circuitosConSeguimiento = new Set(Object.keys(hitosData).map(normStr))

function sentenceCase(str) {
  if (!str) return str
  const lower = str.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function capitalize(str) {
  if (!str) return str
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

const SUBREGIONES_FIJAS = [
  'Valle de aburrá', 'Oriente', 'Occidente', 'Norte',
  'Nordeste', 'Urabá', 'Bajo cauca', 'Magdalena medio', 'Suroeste',
]
const subNorm = SUBREGIONES_FIJAS.map(normStr)

function canonicalSub(raw) {
  const idx = subNorm.indexOf(normStr(sentenceCase(raw ?? '')))
  return idx !== -1 ? SUBREGIONES_FIJAS[idx] : sentenceCase(raw ?? '')
}

function collectCoords(coords, out) {
  if (typeof coords[0] === 'number') out.push(coords)
  else coords.forEach(c => collectCoords(c, out))
}

function getCentroid(geometry) {
  const pts = []
  collectCoords(geometry.coordinates, pts)
  if (!pts.length) return [0, 0]
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ]
}

export function useMapLayers(getMap, { onOptionsLoaded, onStatsLoaded } = {}, { buildCallouts, updateCalloutPositions } = {}) {
  const loading          = ref(true)
  const loadError        = ref(false)
  const fromCache        = ref(false)
  const hoverLabel       = ref({ name: '', x: 0, y: 0, visible: false })
  const viaHoverLabel    = ref({ name: '', km: null, x: 0, y: 0, visible: false })
  const selectedVia      = ref(null)
  const selectedMpio     = ref(null)
  const selectedPuente   = ref(null)
  let _justClickedBridge = false
  const cachedMunicipios = ref(null)

  function logMsg(msg) {
    console.log('[SIMEVA]', msg)
    if (window.addSimevaLog) window.addSimevaLog(msg)
  }
  const cachedVias       = ref(null)
  const cachedPuentesPAP = ref(null)
  let _estabMarkers      = []
  let _clusterMarkers    = []
  let destroyed = false
  const layerPuentesVisible = ref(true)
  const layerPAPVisible     = ref(true)
  const layerViasVisible    = ref(true)
  const store = useMapStore()

  onUnmounted(() => {
    destroyed = true
    _estabMarkers.forEach(m => m.remove())
    _clusterMarkers.forEach(m => m.remove())
  })

  async function loadSimeva() {
    const map = getMap()
    if (!map || destroyed) return
    loading.value   = true
    loadError.value = false

    const [resMunicipios, resVias] = await Promise.allSettled([getMunicipios(), getLocalizaciones()])

    if (destroyed) return

    const munResult = resMunicipios.status === 'fulfilled' ? resMunicipios.value : null
    const viaResult = resVias.status       === 'fulfilled' ? resVias.value       : null

    cachedMunicipios.value = munResult?.data ?? null
    cachedVias.value       = viaResult?.data ?? null
    fromCache.value        = !!(munResult?.fromCache || viaResult?.fromCache)

    const geoMunicipios = cachedMunicipios.value
    const geoVias       = cachedVias.value

    if (resMunicipios.status === 'rejected') console.warn('[SIMEVA] Municipios:', resMunicipios.reason)
    if (resVias.status       === 'rejected') console.warn('[SIMEVA] Vías:', resVias.reason)

    if (!geoMunicipios && !geoVias) {
      loadError.value = true
      loading.value   = false
      return
    }

    // Normaliza texto para comparar sin acentos ni mayúsculas
    const norm = normStr

    // ── Opciones para filtros ─────────────────────────────────────────────────
    const subregiones = geoMunicipios
      ? [...new Set(geoMunicipios.features.map(f => canonicalSub(f.properties.SUBREGION)).filter(Boolean))].sort()
      : []
    // Solo municipios que tienen vías en localizacion.geojson
    const municipioOpts = geoVias
      ? [...new Set(geoVias.features.map(f => sentenceCase(f.properties.MPIO_NOMBR)).filter(Boolean))].sort()
      : []
    const circuitos = geoVias
      ? [...new Set(geoVias.features.map(f => f.properties.CIRCUITO).filter(Boolean))].sort()
      : []

    // municipiosPorSubregion también solo con municipios que tienen vías
    const municipiosConVias = new Set(
      geoVias?.features.map(f => sentenceCase(f.properties.MPIO_NOMBR)).filter(Boolean) ?? []
    )
    const municipiosPorSubregion = {}
    if (geoMunicipios) {
      for (const f of geoMunicipios.features) {
        const sub  = canonicalSub(f.properties.SUBREGION)
        const mpio = sentenceCase(f.properties.MPIO_NOMBR)
        if (sub && mpio && municipiosConVias.has(mpio)) {
          if (!municipiosPorSubregion[sub]) municipiosPorSubregion[sub] = []
          if (!municipiosPorSubregion[sub].includes(mpio)) municipiosPorSubregion[sub].push(mpio)
        }
      }
      for (const k of Object.keys(municipiosPorSubregion)) municipiosPorSubregion[k].sort()
    }

    onOptionsLoaded?.({
      subregiones:           ['Todas las subregiones', ...subregiones],
      municipios:            ['Todos los municipios',  ...municipioOpts],
      circuitos:             ['Todos los circuitos',   ...circuitos],
      municipiosPorSubregion,
    })

    // ── Estadísticas desde propiedades directas del GeoJSON ──────────────────
    const viasDetalle = []
    let longitudTotal = 0
    const kmPorSubregion = {}

    if (geoVias) {
      for (const f of geoVias.features) {
        const p    = f.properties
        const km   = parseFloat(p.Long_km) || 0
        const sub  = canonicalSub(p.SUBREGION) ?? 'Sin subregión'
        const mpio = sentenceCase(p.MPIO_NOMBR ?? '')

        longitudTotal += km
        if (km) kmPorSubregion[sub] = (kmPorSubregion[sub] ?? 0) + km

        viasDetalle.push({
          nombre:       p.NOMBRE_VIA ?? 'Sin nombre',
          codigo:       p.CODIGO_VIA ?? '',
          municipio:    mpio,
          subregion:    sub,
          km:           Math.round(km * 100) / 100,
          avance:       Math.round((parseFloat(p.AV_FISICO) || 0) * 100),
          avanceFin:    Math.round((parseFloat(p.AV_FINAN)  || 0) * 100),
          estabilizado: Math.round((parseFloat(p.ESTABILIZADO) || 0) * 100) / 100,
          contratista:  p.CONTRATIST ?? '',
          contrato:     p.CTO ?? '',
          interventor:  p.INTERV ?? '',
          plazoMeses:   parseFloat(p.PLAZO_MESE) || 0,
          plazo:        p.PLAZO_MESE ? `${p.PLAZO_MESE} meses` : '',
          circuito:     p.CIRCUITO ?? '',
          fechaIni:     p.FECHA_INI ?? '',
        })
      }
    }

    const totalKm = longitudTotal || 1
    const subregionesStats = SUBREGIONES_FIJAS.map(name => {
      const km = kmPorSubregion[name] ?? 0
      return { name, km: Math.round(km * 100) / 100, pct: Math.round((km / totalKm) * 100) }
    })

    const uniqueVias       = new Set(geoVias?.features.map(f => f.properties.NOMBRE_VIA).filter(Boolean)).size
    const uniqueMunicipios = new Set(geoVias?.features.map(f => f.properties.MPIO_NOMBR).filter(Boolean)).size
    const uniqueCircuitos  = new Set(geoVias?.features.map(f => f.properties.CIRCUITO).filter(Boolean)).size

    onStatsLoaded?.({
      viasIntervenidas: uniqueVias,
      longitudTotal:    Math.round(longitudTotal * 100) / 100,
      municipios:       uniqueMunicipios,
      circuitos:        uniqueCircuitos,
      subregiones:      subregionesStats,
      viasDetalle,
    })

    // Ajustar vista a los datos cargados
    if (geoVias?.features.length) {
      let lng0 = Infinity, lng1 = -Infinity, lat0 = Infinity, lat1 = -Infinity
      for (const f of geoVias.features) {
        const geom = f.geometry
        if (!geom) continue
        const lines = geom.type === 'LineString'      ? [geom.coordinates]
                    : geom.type === 'MultiLineString' ? geom.coordinates : []
        for (const line of lines) {
          for (const [lng, lat] of line) {
            if (lng < lng0) lng0 = lng; if (lng > lng1) lng1 = lng
            if (lat < lat0) lat0 = lat; if (lat > lat1) lat1 = lat
          }
        }
      }
      if (lng0 !== Infinity) {
        map.fitBounds([[lng0, lat0], [lng1, lat1]], { padding: 48, duration: 900, maxZoom: 10 })
      }
    }

    if (destroyed) return

    // ── Capa municipios ───────────────────────────────────────────────────────
    if (geoMunicipios) {
      try {
        map.addSource('municipios', { type: 'geojson', data: geoMunicipios, generateId: true })
        map.addLayer({
          id: 'municipios-fill',
          type: 'fill',
          source: 'municipios',
          paint: {
            'fill-color': '#2d8653',
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.22, 0.07],
          },
        })
        map.addLayer({
          id: 'municipios-outline',
          type: 'line',
          source: 'municipios',
          paint: { 'line-color': '#2d8653', 'line-width': 0.8, 'line-opacity': 0.5 },
        })
        map.addLayer({
          id: 'municipios-labels',
          type: 'symbol',
          source: 'municipios',
          layout: {
            'text-field': ['get', 'MPIO_NOMBR'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 7, 9, 10, 13],
            'text-anchor': 'center',
            'text-max-width': 8,
            'text-allow-overlap': false,
            'visibility': 'none',
          },
          paint: {
            'text-color': '#0b5640',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        })

        let hoveredMpio = null
        map.on('mousemove', 'municipios-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer'
          if (hoveredMpio !== null)
            map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: false })
          hoveredMpio = e.features[0].id
          map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: true })

          const activeLayers = []
          if (map.getLayer('puentes-layer')) activeLayers.push('puentes-layer')
          if (map.getLayer('pap-layer')) activeLayers.push('pap-layer')
          if (map.getLayer('puentes-pap-clusters-trigger')) activeLayers.push('puentes-pap-clusters-trigger')

          if (activeLayers.length > 0) {
            const feats = map.queryRenderedFeatures(e.point, { layers: activeLayers })
            if (feats && feats.length > 0) {
              hoverLabel.value.visible = false
              return
            }
          }

          const p = e.features[0].properties
          hoverLabel.value = {
            name: sentenceCase(p.MPIO_NOMBR ?? ''),
            sub: canonicalSub(p.SUBREGION),
            x: e.point.x,
            y: e.point.y,
            visible: true
          }
        })
        map.on('mouseleave', 'municipios-fill', () => {
          map.getCanvas().style.cursor = ''
          if (hoveredMpio !== null)
            map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: false })
          hoveredMpio = null
          hoverLabel.value.visible = false
        })

        map.on('click', 'municipios-fill', (e) => {
          logMsg('Click en municipios-fill')
          const activeLayers = []
          if (map.getLayer('puentes-layer')) activeLayers.push('puentes-layer')
          if (map.getLayer('pap-layer')) activeLayers.push('pap-layer')
          if (map.getLayer('puentes-pap-clusters-trigger')) activeLayers.push('puentes-pap-clusters-trigger')
          if (activeLayers.length > 0) {
            const feats = map.queryRenderedFeatures(e.point, { layers: activeLayers })
            if (feats && feats.length > 0) {
              logMsg('municipios-fill click ignorado: capa activa detectada')
              return
            }
          }

          if (_justClickedBridge) {
            logMsg('municipios-fill click ignorado: _justClickedBridge es true')
            return
          }

          if (store.currentProject === 'puentes') {
            logMsg('Limpiando selectedPuente desde municipios-fill')
            selectedPuente.value = null
            return
          }

          const p = e.features[0].properties
          selectedMpio.value = {
            nombre:    sentenceCase(p.MPIO_NOMBR ?? ''),
            subregion: canonicalSub(p.SUBREGION),
          }
        })
      } catch (err) {
        console.error('[SIMEVA] Error cargando municipios:', err)
      }
    }

    if (geoVias) {
      try {
        const geoViasTagged = {
          ...geoVias,
          features: geoVias.features.map(f => {
            const circNorm = normStr(f.properties.CIRCUITO ?? '')
            let hasEstab = 0
            if (_circuitosConSeguimiento.has(circNorm)) {
              const key = Object.keys(hitosData).find(k => normStr(k) === circNorm)
              const registros = hitosData[key] || []
              for (const r of registros) {
                const acts = [...(r.ejecutadas||[]), ...(r.en_ejecucion||[]), ...(r.pendientes||[])]
                if (acts.some(a => /estabilizaci[oó]n/i.test(a.nombre ?? ''))) {
                  hasEstab = 1
                  break
                }
              }
            }
            return {
              ...f,
              properties: {
                ...f.properties,
                _hasReport: _circuitosConSeguimiento.has(circNorm) ? 1 : 0,
                _hasEstab: hasEstab,
              },
            }
          }),
        }
        map.addSource('vias', { type: 'geojson', data: geoViasTagged, generateId: true })

        // 1. Casing base (siempre visible)
        map.addLayer({
          id: 'vias-casing',
          type: 'line',
          source: 'vias',
          layout: { 'line-cap': 'round', 'line-join': 'round', 'visibility': layerViasVisible.value ? 'visible' : 'none' },
          paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.4 },
        })
        // 2. Halo blanco ampliado en hover
        map.addLayer({
          id: 'vias-hover-casing',
          type: 'line',
          source: 'vias',
          layout: { 'line-cap': 'round', 'line-join': 'round', 'visibility': layerViasVisible.value ? 'visible' : 'none' },
          filter: ['==', ['get', 'NOMBRE_VIA'], ''],
          paint: { 'line-color': '#ffffff', 'line-width': 13, 'line-opacity': 0.55 },
        })
        // 3. Glow verde difuminado en hover
        map.addLayer({
          id: 'vias-glow',
          type: 'line',
          source: 'vias',
          layout: { 'line-cap': 'round', 'line-join': 'round', 'visibility': layerViasVisible.value ? 'visible' : 'none' },
          filter: ['==', ['get', 'NOMBRE_VIA'], ''],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', '_hasEstab'], 1], '#4ade80',
              ['==', ['get', '_hasReport'], 0], '#fca5a5', 
              '#4ade80'
            ],
            'line-width': 16, 'line-opacity': 0.28, 'line-blur': 8,
          },
        })
        // 4. Línea principal (siempre visible)
        map.addLayer({
          id: 'vias-line',
          type: 'line',
          source: 'vias',
          layout: { 'line-cap': 'round', 'line-join': 'round', 'visibility': layerViasVisible.value ? 'visible' : 'none' },
          paint: {
            'line-color': [
              'case',
              ['==', ['get', '_hasEstab'], 1], '#10b981',
              ['==', ['get', '_hasReport'], 0], '#ef4444',
              ['coalesce', ['get', 'stroke'], '#ffaa00'],
            ],
            'line-width':   5,
            'line-opacity': 1,
          },
        })

        // -- Add pulsating markers for estabilización --
        _estabMarkers.forEach(m => m.remove())
        _estabMarkers = []
        
        if (!document.getElementById('estab-pulse-style')) {
          const style = document.createElement('style')
          style.id = 'estab-pulse-style'
          style.innerHTML = `@keyframes estabPulse { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(3.5); opacity: 0; } }`
          document.head.appendChild(style)
        }

        for (const f of geoViasTagged.features) {
          if (f.properties._hasEstab) {
            const geom = f.geometry
            if (!geom) continue
            const pts = geom.type === 'LineString' ? geom.coordinates : geom.type === 'MultiLineString' ? geom.coordinates.flat() : []
            if (!pts.length) continue
            
            let mx = Infinity, mX = -Infinity, my = Infinity, mY = -Infinity
            for (const [lng, lat] of pts) {
              if (lng < mx) mx = lng; if (lng > mX) mX = lng;
              if (lat < my) my = lat; if (lat > mY) mY = lat;
            }
            const clng = (mx + mX) / 2
            const clat = (my + mY) / 2
            
            const el = document.createElement('div')
            el.innerHTML = `<div style="width:14px;height:14px;background:#10b981;border:2px solid #fff;border-radius:50%;position:relative;box-shadow:0 1px 4px rgba(0,0,0,0.3);">
               <div style="position:absolute;inset:-2px;border-radius:50%;background:#10b981;animation:estabPulse 1.5s infinite ease-out;pointer-events:none;"></div>
            </div>`
            el.style.display = layerViasVisible.value ? 'block' : 'none'
            
            const m = new maplibregl.Marker({ element: el })
              .setLngLat([clng, clat])
              .addTo(map)
            _estabMarkers.push(m)
          }
        }
        // 5. Highlight encima en hover (engrosamiento + brillo)
        map.addLayer({
          id: 'vias-hover-line',
          type: 'line',
          source: 'vias',
          layout: { 'line-cap': 'round', 'line-join': 'round', 'visibility': layerViasVisible.value ? 'visible' : 'none' },
          filter: ['==', ['get', 'NOMBRE_VIA'], ''],
          paint: { 'line-color': '#ffffff', 'line-width': 7.5, 'line-opacity': 0.45 },
        })

        const HOVER_FILTER_ON  = (circuito) => ['==', ['get', 'CIRCUITO'], circuito]
        const HOVER_FILTER_OFF = ['==', ['get', 'CIRCUITO'], '']

        function startHover(circuito) {
          const f = HOVER_FILTER_ON(circuito)
          map.setFilter('vias-hover-casing', f)
          map.setFilter('vias-glow', f)
          map.setFilter('vias-hover-line', f)
        }

        function stopHover() {
          map.setFilter('vias-hover-casing', HOVER_FILTER_OFF)
          map.setFilter('vias-glow', HOVER_FILTER_OFF)
          map.setFilter('vias-hover-line', HOVER_FILTER_OFF)
        }

        // Mapa CIRCUITO → { km, avance } agregado para el tooltip
        const circuitDataMap = {}
        for (const f of geoVias.features) {
          const circ = f.properties.CIRCUITO ?? ''
          if (!circuitDataMap[circ]) circuitDataMap[circ] = { km: 0, avanceKm: 0 }
          const km = parseFloat(f.properties.Long_km) || 0
          circuitDataMap[circ].km      += km
          circuitDataMap[circ].avanceKm += (parseFloat(f.properties.AV_FISICO) || 0) * km
        }
        for (const c of Object.values(circuitDataMap)) {
          c.avance = c.km > 0 ? Math.round((c.avanceKm / c.km) * 100) : 0
          c.km     = Math.round(c.km * 100) / 100
        }

        let hoveredVia = null

        map.on('click', 'vias-line', (e) => {
          if (store.currentProject === 'puentes') return

          const p        = e.features[0].properties
          const circuito = p.CIRCUITO ?? ''
          const circuitFeats = cachedVias.value?.features.filter(f => f.properties.CIRCUITO === circuito) ?? []
          const first    = circuitFeats[0]?.properties ?? p
          const municipios = [...new Set(circuitFeats.map(f => sentenceCase(f.properties.MPIO_NOMBR)).filter(Boolean))]
          const data     = circuitDataMap[circuito] ?? {}

          selectedMpio.value = null
          selectedVia.value = {
            name: circuito || 'Circuito sin nombre',
            description: {
              Subregión:               canonicalSub(first.SUBREGION),
              Municipio:               municipios.join(', '),
              Circuito:                circuito,
              Contrato:                first.CTO        ?? '',
              Contratista:             first.CONTRATIST ?? '',
              Interventoría:           first.INTERV     ?? '',
              'Longitud (km)':         data.km ?? '',
              'Avance físico':         `${data.avance ?? 0}%`,
              'Fecha de inicio':       first.FECHA_INI  ?? '',
              'Plazo (meses)':         first.PLAZO_MESE ?? '',
              'Duración transcurrida': first.FECHA_INI && first.PLAZO_MESE
                ? `${pctTiempoTranscurrido(first.FECHA_INI, first.PLAZO_MESE)}%` : '',
            },
          }
        })

        map.on('mousemove', 'vias-line', (e) => {
          map.getCanvas().style.cursor = 'pointer'
          const circuito = e.features[0].properties.CIRCUITO ?? ''
          if (circuito !== hoveredVia) {
            startHover(circuito)
            hoveredVia = circuito
          }
          const data = circuitDataMap[circuito] ?? {}
          viaHoverLabel.value = { name: circuito, km: data.km ?? null, avance: data.avance ?? null, x: e.point.x, y: e.point.y, visible: true }
        })
        map.on('mouseleave', 'vias-line', () => {
          map.getCanvas().style.cursor = ''
          stopHover()
          hoveredVia = null
          viaHoverLabel.value = { ...viaHoverLabel.value, visible: false }
        })

        buildCallouts?.(geoVias.features)
        map.on('move',   updateCalloutPositions)
        map.on('resize', updateCalloutPositions)
      } catch (err) {
        console.error('[SIMEVA] Error cargando vías:', err)
      }
    }

    loading.value = false

    // ── Puentes y PAPs (carga independiente, no bloquea el loader principal) ──
    ;(async () => {
      try {
        const ts = new Date().getTime()
        const r  = await fetch(import.meta.env.BASE_URL + `data/Puentes_PAP_Estructurados.geojson?v=${ts}`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const geoRaw = await r.json()
        if (destroyed) return
        const map = getMap()
        if (!map) return

        const geoData = {
          ...geoRaw,
          features: geoRaw.features.map(f => ({
            ...f,
            properties: {
              ...f.properties,
              _tipo: (f.properties.Proyecto ?? '').toLowerCase().startsWith('pap') ? 'pap' : 'puente',
            },
          })),
        }

        cachedPuentesPAP.value = geoData

        map.addSource('puentes-pap', {
          type: 'geojson',
          data: geoData
        })

        // Capa PAPs — azul
        map.addLayer({
          id: 'pap-layer',
          type: 'circle',
          source: 'puentes-pap',
          filter: ['==', ['get', '_tipo'], 'pap'],
          layout: { visibility: layerPAPVisible.value ? 'visible' : 'none' },
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 10, 12, 18],
            'circle-color': '#3b82f6',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.92,
          },
        })

        // Crear e integrar icono de puente dinámico si no existe en el mapa
        if (!map.hasImage('bridge-icon')) {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');

          // Círculo de fondo
          ctx.beginPath();
          ctx.arc(16, 16, 13, 0, 2 * Math.PI);
          ctx.fillStyle = '#f59e0b'; // Color ámbar
          ctx.fill();

          // Borde blanco
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // Dibujar el icono de puente
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Tablero horizontal del puente
          ctx.beginPath();
          ctx.moveTo(7, 18);
          ctx.lineTo(25, 18);
          ctx.stroke();

          // Pilares principales
          ctx.beginPath();
          ctx.moveTo(9, 10);
          ctx.lineTo(9, 22);
          ctx.moveTo(23, 10);
          ctx.lineTo(23, 22);
          ctx.stroke();

          // Cable principal curvado
          ctx.beginPath();
          ctx.moveTo(9, 11);
          ctx.quadraticCurveTo(16, 19, 23, 11);
          ctx.stroke();

          // Cables tensores verticales
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(13, 15);
          ctx.lineTo(13, 18);
          ctx.moveTo(16, 17);
          ctx.lineTo(16, 18);
          ctx.moveTo(19, 15);
          ctx.lineTo(19, 18);
          ctx.stroke();

          map.addImage('bridge-icon', ctx.getImageData(0, 0, 32, 32));
        }

        // Capa Puentes — tipo symbol con icono de puente
        map.addLayer({
          id: 'puentes-layer',
          type: 'symbol',
          source: 'puentes-pap',
          filter: ['==', ['get', '_tipo'], 'puente'],
          layout: {
            'visibility': layerPuentesVisible.value ? 'visible' : 'none',
            'icon-image': 'bridge-icon',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 1.3, 12, 1.9],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        })

        // Popup compartido
        const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px', className: 'simeva-popup' })
        const fmtCOP = v => v != null ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v) : '—'

        for (const layerId of ['puentes-layer', 'pap-layer']) {
          map.on('click', layerId, (e) => {
            logMsg(`Click detectado en la capa: ${layerId}`)
            _justClickedBridge = true
            setTimeout(() => { _justClickedBridge = false }, 50)

            if (store.currentProject === 'puentes') {
              const props = e.features?.[0]?.properties
              logMsg(`Asignando selectedPuente: ${props?.Proyecto}`)
              selectedPuente.value = props || null
              return
            }

            const p    = e.features[0].properties
            const rows = [
              ['Municipio',   p.Municipio  ?? '—'],
              ['Subregión',   p.Subregion  ?? '—'],
              ['Longitud',    p.Longitud_m ? `${p.Longitud_m} m` : '—'],
              ['Costo total', fmtCOP(p.Costo_tota)],
              ['Estado',      p.Estado     ?? '—'],
              ['Ejecutor',    p.Ejecutor   ?? '—'],
            ].map(([k, v]) => `<tr><td class="sp-key">${k}</td><td class="sp-val">${v}</td></tr>`).join('')

            popup
              .setLngLat(e.lngLat)
              .setHTML(`<div class="sp-header">${p.Proyecto ?? ''}</div><table class="sp-table">${rows}</table>`)
              .addTo(map)
          })
          map.on('mousemove', layerId, (e) => {
            map.getCanvas().style.cursor = 'pointer'
            const p = e.features[0].properties
            hoverLabel.value = {
              name: p.Proyecto ?? 'Proyecto',
              sub: `${p.Municipio ?? ''} (${p.Subregion ?? ''})`,
              x: e.point.x,
              y: e.point.y,
              visible: true
            }
          })
          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = ''
            hoverLabel.value.visible = false
          })
        }

        updateClusters()
        map.on('move', updateClusters)
        map.on('moveend', updateClusters)
      } catch (err) {
        console.warn('[SIMEVA] Puentes/PAPs no disponibles:', err)
      }
    })()
  }

  function renderClusterMarker(map, coords, count, paps, puentes, title, desc, onClick) {
    const el = document.createElement('div')
    el.className = 'simeva-cluster-marker'

    if (count === 1) {
      if (puentes === 1) {
        el.innerHTML = `
          <div style="
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.15s ease;
            filter: drop-shadow(0 2px 6px rgba(0,0,0,0.3));
          "
          onmouseover="this.style.transform='scale(1.15)'"
          onmouseout="this.style.transform='scale(1)'"
          >
            <svg width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="13" fill="#f59e0b" stroke="#ffffff" stroke-width="1.8" />
              <path d="M7 18 L25 18" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M9 10 L9 22 M23 10 L23 22" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M9 11 Q16 19 23 11" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M13 15 L13 18 M16 17 L16 18 M19 15 L19 18" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
        `
      } else {
        el.innerHTML = `
          <div style="
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #3b82f6;
            border: 3px solid #ffffff;
            cursor: pointer;
            transition: transform 0.15s ease;
            box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
          "
          onmouseover="this.style.transform='scale(1.15)'"
          onmouseout="this.style.transform='scale(1)'"
          >
          </div>
        `
      }
    } else {
      let bgGradient = 'linear-gradient(135deg, #0b5640 0%, #16a34a 100%)'
      let shadowColor = 'rgba(11, 86, 64, 0.4)'
      if (paps > 0 && puentes === 0) {
        bgGradient = 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)'
        shadowColor = 'rgba(59, 130, 246, 0.4)'
      } else if (puentes > 0 && paps === 0) {
        bgGradient = 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)'
        shadowColor = 'rgba(245, 158, 11, 0.4)'
      }

      el.innerHTML = `
        <div style="
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: ${bgGradient};
          border: 2px solid #ffffff;
          color: #ffffff;
          font-family: 'Prompt', sans-serif;
          font-size: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px ${shadowColor};
          cursor: pointer;
          transition: transform 0.15s ease;
        "
        onmouseover="this.style.transform='scale(1.1)'"
        onmouseout="this.style.transform='scale(1)'"
        >
          ${count}
        </div>
      `
    }

    el.addEventListener('mousemove', (e) => {
      map.getCanvas().style.cursor = 'pointer'
      const rect = map.getContainer().getBoundingClientRect()
      hoverLabel.value = {
        name: title,
        sub: desc,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        visible: true
      }
    })

    el.addEventListener('mouseleave', () => {
      map.getCanvas().style.cursor = ''
      hoverLabel.value.visible = false
    })

    el.addEventListener('click', onClick)

    const m = new maplibregl.Marker({ element: el })
      .setLngLat(coords)
      .addTo(map)
    _clusterMarkers.push(m)
  }

  function updateClusters() {
    _clusterMarkers.forEach(m => m.remove())
    _clusterMarkers = []

    const map = getMap()
    if (!map || !cachedPuentesPAP.value) return

    const anyVisible = layerPuentesVisible.value || layerPAPVisible.value
    if (!anyVisible) {
      if (map.getLayer('puentes-layer')) map.setLayoutProperty('puentes-layer', 'visibility', 'none')
      if (map.getLayer('pap-layer')) map.setLayoutProperty('pap-layer', 'visibility', 'none')
      return
    }

    const zoom = map.getZoom()
    const visibleFeatures = cachedPuentesPAP.value.features.filter(f => {
      if (f.properties._tipo === 'puente' && !layerPuentesVisible.value) return false
      if (f.properties._tipo === 'pap' && !layerPAPVisible.value) return false
      return true
    })

    if (zoom >= 10.2) {
      if (map.getLayer('puentes-layer')) map.setLayoutProperty('puentes-layer', 'visibility', layerPuentesVisible.value ? 'visible' : 'none')
      if (map.getLayer('pap-layer')) map.setLayoutProperty('pap-layer', 'visibility', layerPAPVisible.value ? 'visible' : 'none')
      return
    }

    if (map.getLayer('puentes-layer')) map.setLayoutProperty('puentes-layer', 'visibility', 'none')
    if (map.getLayer('pap-layer')) map.setLayoutProperty('pap-layer', 'visibility', 'none')

    const mpiosData = {}
    if (cachedMunicipios.value) {
      for (const f of cachedMunicipios.value.features) {
        const mpio = sentenceCase(f.properties.MPIO_NOMBR)
        if (!mpio) continue
        const cent = getCentroid(f.geometry)
        const bounds = new maplibregl.LngLatBounds()
        const extend = (c) => {
          if (typeof c[0] === 'number') bounds.extend(c)
          else c.forEach(extend)
        }
        extend(f.geometry.coordinates)

        mpiosData[mpio] = {
          name: mpio,
          subregion: canonicalSub(f.properties.SUBREGION),
          centroid: cent,
          bounds: bounds,
          features: []
        }
      }
    }

    for (const f of visibleFeatures) {
      const mpio = sentenceCase(f.properties.Municipio)
      if (mpiosData[mpio]) {
        mpiosData[mpio].features.push(f)
      }
    }

    for (const mpio of Object.keys(mpiosData)) {
      const data = mpiosData[mpio]
      if (!data.features.length) continue

      const paps = data.features.filter(f => f.properties._tipo === 'pap').length
      const puentes = data.features.filter(f => f.properties._tipo === 'puente').length
      const count = data.features.length

      const cent = count === 1
        ? data.features[0].geometry.coordinates
        : data.centroid

      const title = count === 1
        ? data.features[0].properties.Proyecto
        : `Municipio: ${mpio}`

      let desc = ''
      if (count === 1) {
        const f = data.features[0]
        desc = `${f.properties.Municipio ?? ''} (${f.properties.Subregion ?? ''})`
      } else {
        if (puentes > 0 && paps > 0) {
          desc = `${puentes} puentes y ${paps} puntos críticos`
        } else if (puentes > 0) {
          desc = `${puentes} puentes`
        } else {
          desc = `${paps} puntos críticos`
        }
      }

      renderClusterMarker(map, cent, count, paps, puentes, title, desc, () => {
        logMsg(`Click en marcador de clúster count=${count}, title=${title}`)
        if (count === 1) {
          _justClickedBridge = true
          setTimeout(() => { _justClickedBridge = false }, 50)
          map.flyTo({ center: cent, zoom: 11, duration: 800 })
          if (store.currentProject === 'puentes') {
            const props = data.features?.[0]?.properties
            logMsg(`Asignando selectedPuente desde clúster 1: ${props?.Proyecto}`)
            selectedPuente.value = props || null
          }
        } else {
          map.fitBounds(data.bounds, { padding: 80, duration: 600 })
        }
      })
    }
  }

  watch(() => store.currentProject, (proj) => {
    selectedPuente.value = null
    let puentesVisible = true
    let papVisible = true
    let viasVisible = true

    if (proj === 'puentes') {
      puentesVisible = true
      papVisible = true
      viasVisible = false
    } else if (proj === 'estabilizacion') {
      puentesVisible = false
      papVisible = false
      viasVisible = true
    }

    layerPuentesVisible.value = puentesVisible
    layerPAPVisible.value = papVisible
    layerViasVisible.value = viasVisible

    const map = getMap()
    if (map) {
      if (map.getLayer('puentes-layer')) {
        map.setLayoutProperty('puentes-layer', 'visibility', puentesVisible ? 'visible' : 'none')
      }
      if (map.getLayer('pap-layer')) {
        map.setLayoutProperty('pap-layer', 'visibility', papVisible ? 'visible' : 'none')
      }
      if (map.getLayer('puentes-pap-clusters-trigger')) {
        map.setLayoutProperty('puentes-pap-clusters-trigger', 'visibility', (puentesVisible || papVisible) ? 'visible' : 'none')
      }
      const viasLayers = ['vias-line', 'vias-casing', 'vias-hover-casing', 'vias-glow', 'vias-hover-line']
      viasLayers.forEach(ly => {
        if (map.getLayer(ly)) {
          map.setLayoutProperty(ly, 'visibility', viasVisible ? 'visible' : 'none')
        }
      })
      _estabMarkers.forEach(m => {
        const el = m.getElement()
        if (el) el.style.display = viasVisible ? 'block' : 'none'
      })
      updateClusters()
    }
  }, { immediate: true })

  function togglePuentesLayer() {
    layerPuentesVisible.value = !layerPuentesVisible.value
    const map = getMap()
    if (map?.getLayer('puentes-layer')) {
      map.setLayoutProperty('puentes-layer', 'visibility', layerPuentesVisible.value ? 'visible' : 'none')
    }
    if (map?.getLayer('puentes-pap-clusters-trigger')) {
      map.setLayoutProperty('puentes-pap-clusters-trigger', 'visibility', (layerPuentesVisible.value || layerPAPVisible.value) ? 'visible' : 'none')
    }
    updateClusters()
  }

  function togglePAPLayer() {
    layerPAPVisible.value = !layerPAPVisible.value
    const map = getMap()
    if (map?.getLayer('pap-layer')) {
      map.setLayoutProperty('pap-layer', 'visibility', layerPAPVisible.value ? 'visible' : 'none')
    }
    if (map?.getLayer('puentes-pap-clusters-trigger')) {
      map.setLayoutProperty('puentes-pap-clusters-trigger', 'visibility', (layerPuentesVisible.value || layerPAPVisible.value) ? 'visible' : 'none')
    }
    updateClusters()
  }

  return { loading, loadError, fromCache, hoverLabel, viaHoverLabel, selectedVia, selectedMpio, selectedPuente, cachedMunicipios, cachedVias, loadSimeva, layerPuentesVisible, layerPAPVisible, layerViasVisible, togglePuentesLayer, togglePAPLayer }
}
