import { ref, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'
import { getLocalizaciones, getMunicipios } from '../services/api.js'
import { pctTiempoTranscurrido } from '../utils/stats.js'
import hitosData from '../data/hitos.json'

const normStr = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
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

export function useMapLayers(getMap, { onOptionsLoaded, onStatsLoaded } = {}, { buildCallouts, updateCalloutPositions } = {}) {
  const loading          = ref(true)
  const loadError        = ref(false)
  const fromCache        = ref(false)
  const hoverLabel       = ref({ name: '', x: 0, y: 0, visible: false })
  const viaHoverLabel    = ref({ name: '', km: null, x: 0, y: 0, visible: false })
  const selectedVia      = ref(null)
  const selectedMpio     = ref(null)
  const cachedMunicipios = ref(null)
  const cachedVias       = ref(null)
  let _estabMarkers      = []
  let destroyed = false
  const layerPuentesVisible = ref(true)
  const layerPAPVisible     = ref(true)

  onUnmounted(() => { destroyed = true })

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
    const norm = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

    const SUBREGIONES_FIJAS = [
      'Valle de aburrá', 'Oriente', 'Occidente', 'Norte',
      'Nordeste', 'Urabá', 'Bajo cauca', 'Magdalena medio', 'Suroeste',
    ]
    const subNorm = SUBREGIONES_FIJAS.map(norm)

    function canonicalSub(raw) {
      const idx = subNorm.indexOf(norm(sentenceCase(raw ?? '')))
      return idx !== -1 ? SUBREGIONES_FIJAS[idx] : sentenceCase(raw ?? '')
    }

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
          if (hoveredMpio !== null)
            map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: false })
          hoveredMpio = e.features[0].id
          map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: true })
        })
        map.on('mouseleave', 'municipios-fill', () => {
          if (hoveredMpio !== null)
            map.setFeatureState({ source: 'municipios', id: hoveredMpio }, { hover: false })
          hoveredMpio = null
        })

        map.on('click', 'municipios-fill', (e) => {
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
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.4 },
        })
        // 2. Halo blanco ampliado en hover
        map.addLayer({
          id: 'vias-hover-casing',
          type: 'line',
          source: 'vias',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          filter: ['==', ['get', 'NOMBRE_VIA'], ''],
          paint: { 'line-color': '#ffffff', 'line-width': 13, 'line-opacity': 0.55 },
        })
        // 3. Glow verde difuminado en hover
        map.addLayer({
          id: 'vias-glow',
          type: 'line',
          source: 'vias',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
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
          layout: { 'line-cap': 'round', 'line-join': 'round' },
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
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          filter: ['==', ['get', 'NOMBRE_VIA'], ''],
          paint: { 'line-color': '#ffffff', 'line-width': 7.5, 'line-opacity': 0.45 },
        })

        const HOVER_FILTER_ON  = (circuito) => ['==', ['get', 'CIRCUITO'], circuito]
        const HOVER_FILTER_OFF = ['==', ['get', 'CIRCUITO'], '']

        function startHover(nombreVia) {
          const f = HOVER_FILTER_ON(nombreVia)
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

        map.addSource('puentes-pap', { type: 'geojson', data: geoData })

        // Capa PAPs — azul
        map.addLayer({
          id: 'pap-layer',
          type: 'circle',
          source: 'puentes-pap',
          filter: ['==', ['get', '_tipo'], 'pap'],
          layout: { visibility: 'visible' },
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 5, 12, 9],
            'circle-color': '#3b82f6',
            'circle-stroke-width': 2,
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
            'visibility': 'visible',
            'icon-image': 'bridge-icon',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.65, 12, 0.95],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        })

        // Popup compartido
        const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px', className: 'simeva-popup' })
        const fmtCOP = v => v != null ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v) : '—'

        for (const layerId of ['puentes-layer', 'pap-layer']) {
          map.on('click', layerId, (e) => {
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
          map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
        }
      } catch (err) {
        console.warn('[SIMEVA] Puentes/PAPs no disponibles:', err)
      }
    })()
  }

  function togglePuentesLayer() {
    layerPuentesVisible.value = !layerPuentesVisible.value
    const map = getMap()
    if (map?.getLayer('puentes-layer'))
      map.setLayoutProperty('puentes-layer', 'visibility', layerPuentesVisible.value ? 'visible' : 'none')
  }

  function togglePAPLayer() {
    layerPAPVisible.value = !layerPAPVisible.value
    const map = getMap()
    if (map?.getLayer('pap-layer'))
      map.setLayoutProperty('pap-layer', 'visibility', layerPAPVisible.value ? 'visible' : 'none')
  }

  return { loading, loadError, fromCache, hoverLabel, viaHoverLabel, selectedVia, selectedMpio, cachedMunicipios, cachedVias, loadSimeva, layerPuentesVisible, layerPAPVisible, togglePuentesLayer, togglePAPLayer }
}
