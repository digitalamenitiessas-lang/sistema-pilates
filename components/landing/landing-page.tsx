'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  ChevronDown,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Users,
  X,
} from 'lucide-react'
import { cn, vigenciaTexto } from '@/lib/utils'
import { Logotipo } from '@/components/layout/logotipo'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------
// Datos del estudio
//
// Desde la migración 0011 salen de la tabla studio_settings (vista pública
// `public_studio_settings`) y se editan desde Configuración. Estos valores
// quedan como respaldo por si la migración todavía no corrió o una clave
// está vacía.
//
// El respaldo es el dato real del estudio, nunca uno de muestra: un
// teléfono o una dirección inventados no son un campo pendiente, mandan a
// la persona a otro lado. Los datos que el estudio todavía no dio quedan
// vacíos a propósito y la pantalla esconde ese elemento.
// ---------------------------------------------------------------
const STUDIO_FALLBACK = {
  name: 'Casa Fe',
  /**
   * En tres renglones y en ese orden, como los pidió la clienta: primero
   * dónde queda (el shopping, que es la referencia que la gente conoce),
   * después la puerta y el local, y al final la ciudad. Los saltos de
   * línea son parte del dato, no del diseño — ver `bloquesDeTexto`.
   */
  address: 'Mercato Shopping Viejo\nMariano Moreno 107, Local 10\nYerba Buena, Tucumán',
  mapsUrl: '',
  /**
   * Solo dígitos, como lo pide `wa.me`: 54 (país) + 9 (que WhatsApp exige para
   * los móviles argentinos) + 381 (Tucumán) + el número. Sin el 9 el link
   * abre un chat que no existe, y eso no da error: abre y no llega nadie.
   *
   * Estuvo vacío desde la 0033, que borró el número de la demo porque mandaba
   * gente a un teléfono que no era del estudio. Vacío era lo correcto mientras
   * no hubiera número; ahora que el estudio lo dio, el respaldo lo lleva —el
   * criterio de este bloque es que el respaldo sea siempre el dato real.
   */
  whatsapp: '5493816249107',
  instagram: 'casafe.pilates',
  email: 'casafe.pilates@gmail.com',
  /** Dos bloques separados por una línea en blanco: el día arriba, la hora abajo. */
  openHours: 'Lunes a viernes\nde 8 a 20 horas\n\nSábados\nde 9 a 13 horas',
  /**
   * La línea que el manual pone debajo de la dirección. Es copy de la
   * clienta, así que el respaldo es su texto — igual que la dirección.
   *
   * La clave `studio_parking` la creó la migración `0043`, que **ya corrió**
   * (verificado el 11/09 contra `public_studio_settings`). O sea que esto
   * hoy no se publica nunca: el estudio edita y vacía esa línea desde
   * Configuración, y el respaldo quedó para lo que son todos los respaldos
   * de acá — que la página no salga vacía si la fila desaparece.
   */
  parking: 'Estacionamiento exclusivo para alumnas',
}

type Studio = typeof STUDIO_FALLBACK

/**
 * El logotipo. Estas tres líneas no son datos del estudio sino parte de la
 * marca —vienen dibujadas así en el manual— y por eso viven acá y no en
 * studio_settings: cambiarlas es rehacer el logo, no ajustar un parámetro.
 * El nombre sí sale de la base, y se parte en líneas como en el manual.
 */
const MARCA = {
  sobre: 'Pilates Studio',
  bajo: 'Wellness & Movement',
  desde: 'ESTD / 2026',
}

/**
 * La bajada del manual, palabra por palabra. Es copy de la clienta, no
 * texto de relleno, y el paréntesis final va en negrita como en el diseño.
 */
const BAJADA = {
  lineas: [
    'Estudio boutique de Pilates y movimiento consciente,',
    'pensado como una experiencia integral del bienestar,',
  ],
  cierre: '( El movimiento se convierte en pausa )',
}

interface DisciplineStyle { dot: string; bg: string; text: string; blurb: string }

/**
 * Estilo con el que se dibuja una disciplina cuyo color todavía no bajó
 * del catálogo. Antes acá había seis disciplinas escritas a mano como
 * respaldo, y eso era peor que no tener nada: si la consulta fallaba, la
 * web le ofrecía a una persona que no conoce el estudio seis clases que
 * el estudio no dicta. Mostrar menos es recuperable; prometer de más, no.
 */
const ESTILO_GENERICO: DisciplineStyle = {
  dot: '#847164', bg: '#bcbaae', text: '#000000', blurb: '',
}

/** Vacío a propósito: las disciplinas salen del catálogo (migración 0011). */
const DISCIPLINE_FALLBACK: Record<string, DisciplineStyle> = {}

/**
 * Las fotos que mandó la clienta, atadas a la disciplina por nombre. Vive
 * acá y no en el catálogo porque `disciplines` no tiene columna de imagen:
 * el día que la tenga, esto se borra y la foto viaja con el dato. Una
 * disciplina sin foto se dibuja igual, sin el bloque de imagen.
 */
const FOTO_DISCIPLINA: Record<string, string> = {
  reformer: '/marca/reformer.jpg',
  prenatal: '/marca/prenatal.jpg',
  embarazadas: '/marca/prenatal.jpg',
}

function fotoDe(nombre: string): string | null {
  const limpio = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  const clave = Object.keys(FOTO_DISCIPLINA).find((k) => limpio.includes(k))
  return clave ? FOTO_DISCIPLINA[clave] : null
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Los números de la web salen de la grilla, y un "1 disciplinas" delata que no. */
function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios
}

/**
 * Un dato de texto libre del estudio, partido como el estudio lo escribió:
 * cada salto de línea es un renglón y una línea en blanco abre un bloque
 * nuevo. Lo usan la dirección y el horario, que la clienta pidió leer en
 * renglones cortos y no en una frase corrida.
 *
 * Existe en vez de un `whitespace-pre-line` porque el diseño separa los
 * bloques entre sí más que los renglones de adentro, y esa diferencia no
 * se puede pedir con un salto de línea. De paso tolera el dato viejo: un
 * texto sin saltos entra como un bloque de un renglón y se ve igual que antes.
 */
function bloquesDeTexto(texto: string): string[][] {
  return texto
    .split(/\n\s*\n/)
    .map((bloque) => bloque.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((bloque) => bloque.length > 0)
}

/**
 * La descripción de una disciplina, partida en las líneas cortas del
 * diseño. El catálogo guarda un texto libre: si trae saltos de línea o
 * puntos medios los respeta, y si es una frase sola queda una línea.
 */
function lineasDelBlurb(blurb: string): string[] {
  return blurb
    .split(/\n|·|;/)
    .map((l) => l.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------
// Contexto de la landing: datos del estudio y disciplinas, cargados en vivo
// desde las vistas públicas. Con respaldo, así la página nunca queda vacía.
// ---------------------------------------------------------------
interface LandingData {
  studio: Studio
  disciplines: Record<string, DisciplineStyle>
  /** Orden en el que se muestran (el del catálogo) */
  disciplineNames: string[]
}

const LandingCtx = createContext<LandingData>({
  studio: STUDIO_FALLBACK,
  disciplines: DISCIPLINE_FALLBACK,
  disciplineNames: Object.keys(DISCIPLINE_FALLBACK),
})

function useLanding(): LandingData {
  return useContext(LandingCtx)
}

/**
 * Link de WhatsApp con el mensaje ya escrito, o `null` si el estudio
 * todavía no cargó su número. Devolver null y no una cadena obliga a cada
 * botón a decidir qué hace sin número, en vez de abrir wa.me/ vacío.
 */
function useWa(): (text: string) => string | null {
  const { studio } = useLanding()
  return (text: string) =>
    studio.whatsapp
      ? `https://wa.me/${studio.whatsapp}?text=${encodeURIComponent(text)}`
      : null
}

/**
 * A dónde lleva "Cómo llegar". Si el estudio pegó su link de Google Maps en
 * Configuración, ese manda. Si no lo cargó, se arma la búsqueda con el
 * nombre y la dirección, que es exactamente lo que haría a mano quien
 * quiere ubicar el estudio — y es un link que no se rompe ni queda viejo.
 * Sin dirección devuelve null y el elemento no se dibuja.
 */
function useMapa(): string | null {
  const { studio } = useLanding()
  if (studio.mapsUrl) return studio.mapsUrl
  if (!studio.address) return null
  const consulta = [studio.name, studio.address.replace(/\n/g, ', ')]
    .filter(Boolean)
    .join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`
}

/**
 * Por dónde escribe quien quiere anotarse: WhatsApp si el estudio cargó su
 * número, y si no, el mail con el asunto ya puesto. Devuelve null solo
 * cuando no hay ninguno de los dos, y ahí el botón no se dibuja.
 *
 * Existe porque Planes es la única sección donde no ofrecer nada es peor
 * que ofrecer el camino largo: es la pantalla donde alguien ya decidió que
 * quiere venir.
 *
 * Recibe dos textos y no uno. Lo que sirve de asunto de un mail —corto, sin
 * saludo— es un mensaje de WhatsApp seco, y al revés un buen mensaje de
 * WhatsApp es un asunto larguísimo. Antes se mandaba el mismo string a los dos
 * lados y ganaba la forma del mail, que es el canal que casi nadie usa.
 */
function useContacto(): (mensaje: string, asunto: string) => string | null {
  const { studio } = useLanding()
  const wa = useWa()
  return (mensaje: string, asunto: string) =>
    wa(mensaje) ??
    (studio.email ? `mailto:${studio.email}?subject=${encodeURIComponent(asunto)}` : null)
}

function Instagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

interface PublicPlan {
  id: string
  name: string
  price: number
  class_count: number
  duration_days: number
  /**
   * Meses de calendario que dura (0036). Opcional porque la vista
   * `public_plans` enumera columnas y recién lo agrega la 0037: mientras esa
   * migración no corra el dato no viaja. Ausente se toma como UN MES, que es
   * lo que hoy dura todo plan pago del estudio —la 0036 les puso
   * duration_months = 1 y les dejó duration_days en 30—, porque el respaldo
   * tiene que ser el valor correcto de hoy: publicar "Vigencia 30 días" de
   * un mes de calendario es justo la promesa de más que hay que dejar de
   * hacer. Presente manda el dato, el 0 incluido.
   */
  duration_months?: number
  disciplines: string[]
  description: string
  color: string
  popular: boolean
  is_trial: boolean
}

interface PublicClass {
  id: string
  title: string
  discipline: string
  day_of_week: number
  start_time: string
  duration_minutes: number
  room: string
  capacity: number
  teacher_name: string
}

// ---------------------------------------------------------------
// Utilidades de animación
// ---------------------------------------------------------------
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible')
          io.disconnect()
        }
      },
      { threshold: 0.12 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={cn('reveal', className)}
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const duration = 1400
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          const eased = 1 - Math.pow(1 - t, 3)
          setValue(Math.round(target * eased))
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.5 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [target])
  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  )
}

/** Desplazamiento sutil según el scroll (parallax). */
function useParallax(factor: number) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const update = () => {
      const rect = el.getBoundingClientRect()
      const offset = rect.top + rect.height / 2 - window.innerHeight / 2
      el.style.transform = `translateY(${offset * -factor}px)`
      raf = 0
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [factor])
  return ref
}

// ---------------------------------------------------------------
// Piezas tipográficas de la marca
//
// Dos gestos, medidos sobre el manual: la Montserrat en mayúsculas va con
// 0.12em de tracking, y la Bodoni de titulares con interlínea 0.88. Están
// acá y no repetidos en cada sección para que un ajuste sea un solo lugar.
// ---------------------------------------------------------------
function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('eyebrow text-[11px] md:text-xs text-foreground/60', className)}>
      {children}
    </p>
  )
}

function Titular({
  children,
  className,
  as: Tag = 'h2',
}: {
  children: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return <Tag className={cn('display uppercase', className)}>{children}</Tag>
}

// ---------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------
function Nav() {
  const { studio } = useLanding()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // El orden y los rótulos son los del manual, en mayúsculas.
  const links = [
    { href: '#estudio', label: 'Estudio' },
    { href: '#planes', label: 'Planes' },
    { href: '#disciplinas', label: 'Disciplinas' },
    { href: '#horarios', label: 'Horarios' },
    { href: '#contacto', label: 'Contacto' },
  ]

  return (
    <header
      className={cn(
        // Sticky y no fixed: así la barra ocupa su lugar en el flujo y el
        // hero no necesita un margen superior a mano que quede desfasado
        // cuando cambia la altura de la barra.
        'sticky top-0 z-50 transition-all duration-500 bg-background',
        scrolled || menuOpen ? 'py-3 shadow-[0_1px_0_0_var(--border)]' : 'py-5'
      )}
    >
      <div className="max-w-6xl mx-auto px-5 flex items-center gap-8">
        {/* El logotipo aparece recién cuando el hero salió de pantalla: en el
            manual la barra arranca limpia, pero más abajo hay que saber de
            quién es la página. */}
        <a
          href="#"
          onClick={() => setMenuOpen(false)}
          className={cn(
            'text-lg transition-all duration-500 shrink-0',
            // En el celular no hay barra de links que sostenga la marca, así
            // que el logotipo va siempre; en desktop aparece al scrollear,
            // como en el manual.
            scrolled
              ? 'opacity-100 w-auto'
              : 'md:opacity-0 md:w-0 md:overflow-hidden md:pointer-events-none'
          )}
        >
          <Logotipo nombre={studio.name} />
        </a>

        <nav className="hidden md:flex items-center gap-8 lg:gap-10">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="eyebrow text-[11px] lg:text-xs text-foreground hover:text-primary-fuerte transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 ml-auto">
          <Link
            href="/sistema"
            className="eyebrow text-[11px] lg:text-xs px-5 py-2.5 rounded-full border border-foreground text-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            Ingresar
          </Link>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            className="md:hidden w-10 h-10 rounded-full border border-foreground/25 flex items-center justify-center text-foreground"
          >
            {menuOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
          </button>
        </div>
      </div>

      {/* Menú mobile */}
      <div
        className={cn(
          'md:hidden overflow-hidden transition-all duration-400',
          menuOpen ? 'max-h-96' : 'max-h-0'
        )}
      >
        <nav className="px-5 pt-4 pb-5 flex flex-col">
          {links.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'eyebrow text-xs py-3.5 text-foreground border-b border-border last:border-0',
                menuOpen && 'fade-up'
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}

/**
 * El hero es el logotipo del manual sobre la foto, con la textura de óxido
 * encima para sacarle el plano perfecto. El texto va en natural (#e1dfdb),
 * no en blanco: es el color de la marca y el manual lo usa así.
 */
function Hero() {
  const { studio } = useLanding()
  const wa = useWa()
  const prueba = wa('¡Hola! Vi la web y me interesa reservar una clase de prueba. ¿Me pasan info? 🙌')

  return (
    <section className="relative h-[calc(88vh-4.5rem)] min-h-[520px] max-h-[820px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        {/* El recorte apaisado pesa 290 KB y en un teléfono no se ve entero.
            `images.unoptimized` está en true, así que la versión chica hay
            que servirla a mano — Next no la genera. */}
        {/* `contents` para que la que dimensione sea la <img>: un <picture>
            inline no tiene alto y el h-full de adentro daría cero. */}
        <picture className="contents">
          <source media="(max-width: 640px)" srcSet="/marca/hero-movil.jpg" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marca/hero.jpg"
            alt="Clase de Pilates Reformer en el estudio"
            className="w-full h-full object-cover kenburns"
          />
        </picture>
        <div aria-hidden className="absolute inset-0 textura-oxido" />
        <div aria-hidden className="absolute inset-0 bg-foreground/35" />
      </div>

      <div className="relative text-center px-5">
        <p className="fade-up eyebrow font-bold text-xs md:text-base text-background" style={{ animationDelay: '150ms' }}>
          {MARCA.sobre}
        </p>

        {/* El logotipo entra en UNA pieza y no palabra por palabra como
            antes. La entrada escalonada quedaba linda, pero para hacerla hay
            que partir el lockup en dos y volver a apilarlo con CSS — o sea,
            reconstruir el logo, que es justo lo que la clienta pidió que no
            hiciéramos. El gesto se conserva: sube entero desde abajo.

            Los tamaños son los mismos de antes porque el componente se mide
            en `em`: acá se fija el cuerpo de la letra y la imagen entra
            exactamente donde entraba el texto. */}
        <h1 className="text-background my-3 md:my-5 text-[19vw] sm:text-[15vw] md:text-[9.5rem] lg:text-[11rem]">
          <span className="word-mask">
            <span className="word-rise" style={{ animationDelay: '300ms' }}>
              <Logotipo nombre={studio.name} />
            </span>
          </span>
        </h1>

        <p className="fade-up eyebrow text-xs md:text-base text-background" style={{ animationDelay: '700ms' }}>
          {MARCA.bajo}
        </p>
        <p className="fade-up eyebrow text-xs md:text-base text-background/85 mt-2" style={{ animationDelay: '800ms' }}>
          {MARCA.desde}
        </p>

        {prueba && (
          <a
            href={prueba}
            target="_blank"
            rel="noreferrer"
            className="fade-up eyebrow text-[11px] md:text-xs inline-block mt-9 px-7 py-3 rounded-full border border-background/70 text-background hover:bg-background hover:text-foreground transition-colors"
            style={{ animationDelay: '950ms' }}
          >
            Reservá tu clase de prueba
          </a>
        )}
      </div>

      <a
        href="#estudio"
        aria-label="Bajar al contenido"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-background/70 hover:text-background transition-colors"
      >
        <ChevronDown className="w-6 h-6 scroll-hint" />
      </a>
    </section>
  )
}

/** La bajada del manual: tres líneas centradas, la última entre paréntesis. */
function Bajada() {
  return (
    <section className="py-16 md:py-24 px-5">
      <Reveal className="max-w-3xl mx-auto text-center">
        {BAJADA.lineas.map((l) => (
          <p key={l} className="eyebrow text-[11px] md:text-sm text-foreground leading-relaxed">
            {l}
          </p>
        ))}
        <p className="eyebrow font-bold text-[11px] md:text-sm text-foreground leading-relaxed">
          {BAJADA.cierre}
        </p>
      </Reveal>
    </section>
  )
}

/**
 * El tríptico de fotos del manual y, debajo, el bloque del estudio. Los
 * números se cuentan sobre lo publicado: las clases, las profesoras y las
 * salas salen de la grilla, y las disciplinas del catálogo, que es donde el
 * estudio las edita. Antes había un respaldo escrito a mano (23 clases, 6
 * disciplinas) que aparecía justo cuando la consulta no volvía: el momento
 * en que nadie podía desmentirlo. En cero no se muestra: es que no hay dato.
 */
function Estudio({ schedule }: { schedule: PublicClass[] }) {
  const { disciplineNames } = useLanding()
  const fotos = [
    { src: '/marca/estudio-pelota.jpg', alt: 'Alumna estirando con pelota en el estudio' },
    { src: '/marca/estudio-aro.jpg', alt: 'Trabajo de piernas con aro de Pilates' },
    { src: '/marca/estudio-sala.jpg', alt: 'Sala del estudio con camas de Reformer' },
  ]

  const cuenta = (valor: (c: PublicClass) => string) =>
    new Set(schedule.map(valor)).size
  const profesoras = cuenta((c) => c.teacher_name)
  const salas = cuenta((c) => c.room)
  /**
   * El tamaño del grupo sale de la grilla publicada y no escrito a mano: el
   * día que el estudio abra clases de otro cupo, la web no queda prometiendo
   * el número viejo. Solo se afirma cuando TODAS las clases coinciden —con
   * cupos distintos la frase sería falsa—, y ahí se publica nada más la
   * mitad de la oración que sigue siendo cierta.
   */
  const cupos = new Set(schedule.map((c) => c.capacity))
  const cupo = cupos.size === 1 ? [...cupos][0] : null
  const stats = [
    { n: schedule.length, label: plural(schedule.length, 'clase por semana', 'clases por semana') },
    { n: disciplineNames.length, label: plural(disciplineNames.length, 'disciplina', 'disciplinas') },
    { n: profesoras, label: plural(profesoras, 'profesora', 'profesoras') },
    { n: salas, label: plural(salas, 'sala equipada', 'salas equipadas') },
  ].filter((s) => s.n > 0)

  return (
    <section id="estudio" className="scroll-mt-24">
      <div className="grid grid-cols-3 gap-1 md:gap-1.5">
        {fotos.map((f, i) => (
          <Reveal key={f.src} delay={i * 120}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* 3:4 y no una altura fija: con `h-[30rem]` en una pantalla de
                1440 la celda quedaba de 480 de ancho por 480 de alto, o sea
                cuadrada, que es justo lo que la clienta pidió cambiar. El
                alto atado al ancho mantiene el recorte vertical en
                cualquier pantalla, y las fotos son 1200x1800, así que la
                relación sale del original sin estirar nada. */}
            <img
              src={f.src}
              alt={f.alt}
              className="w-full aspect-3/4 object-cover"
            />
          </Reveal>
        ))}
      </div>

      <div className="max-w-4xl mx-auto px-5 pt-16 md:pt-24 pb-20 md:pb-28 text-center">
        <Reveal>
          <Titular className="text-[9vw] sm:text-5xl md:text-6xl">
            Bienestar &amp; Movimiento
          </Titular>
        </Reveal>
        <Reveal delay={120}>
          {/* Copy de la clienta (12/09). */}
          <p className="text-sm md:text-base text-foreground/75 leading-relaxed mt-8 max-w-2xl mx-auto">
            Cada cuerpo tiene su propio punto de partida. Por eso trabajamos en
            grupos reducidos, con seguimiento cercano y clases pensadas para
            acompañar tu evolución.
          </p>
          <p className="text-sm md:text-base text-foreground/75 leading-relaxed mt-3 max-w-2xl mx-auto">
            {cupo !== null && `${cupo} ${plural(cupo, 'alumna', 'alumnas')} por clase. `}
            Más atención, más precisión, una mejor experiencia.
          </p>
        </Reveal>

        {stats.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-14">
            {stats.map((s, i) => (
              <Reveal key={s.label} delay={200 + i * 90}>
                <p className="display text-4xl md:text-5xl text-foreground">
                  <Counter target={s.n} />
                </p>
                <p className="eyebrow text-[10px] text-foreground/55 mt-2.5">{s.label}</p>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Los planes, en la retícula de seis del manual: tarjetas en verde claro
 * con filete negro. Si el estudio publica otro número de planes la grilla
 * se acomoda sola — seis es lo que hay hoy, no una constante.
 */
function Planes({ plans }: { plans: PublicPlan[] }) {
  const contacto = useContacto()
  const reservaPrueba = contacto(
    '¡Hola! Me interesa la clase de prueba. ¿Me cuentan cómo reservar?',
    'Quiero reservar mi clase de prueba'
  )
  const trial = plans.find((p) => p.is_trial)
  const paid = plans
    .filter((p) => !p.is_trial)
    .sort((a, b) => a.price - b.price)
    .map((plan) => {
      // 0 = la vigencia se cuenta en días; ausente = un mes (ver PublicPlan).
      const meses = plan.duration_months ?? 1
      // Cobrar por mes y durar un mes son lo mismo acá: el precio y las
      // clases son de todo el período, no de un mes suelto adentro.
      const mensual = meses === 1
      return {
        plan,
        consulta: contacto(
          `¡Hola! Me interesa el plan ${plan.name}. ¿Me pasan más información?`,
          `Consulta por el plan ${plan.name}`
        ),
        meses,
        mensual,
        sufijoPrecio: mensual ? '/mes' : meses > 1 ? `/${meses} meses` : null,
      }
    })

  return (
    <section id="planes" className="scroll-mt-24 py-20 md:py-28 bg-muted">
      <div className="max-w-6xl mx-auto px-5">
        <Reveal className="text-center mb-14">
          <Rotulo>Planes</Rotulo>
          <Titular className="text-[9vw] sm:text-5xl md:text-6xl mt-5">
            Elegí tu frecuencia
          </Titular>
          {/* Copy de la clienta (12/09). Dos renglones a propósito: el
              primero invita a elegir y el segundo es el dato duro. */}
          <p className="text-sm text-foreground/65 max-w-lg mx-auto mt-6 leading-relaxed">
            Definí cuántas veces por semana querés venir y encontrá la
            frecuencia que mejor se adapta a tu rutina.
          </p>
          <p className="text-sm text-foreground/65 max-w-lg mx-auto mt-2.5 leading-relaxed">
            Sin matrícula. Planes desde 1 hasta 5 veces por semana.
          </p>
        </Reveal>

        {trial && (
          <Reveal delay={120}>
            {/* El marrón de la marca y no el negro: lo pidió la clienta. Con
                blanco encima da 4.64:1, así que el texto chico de adentro va
                en blanco pleno y no atenuado. */}
            <div className="rounded-3xl bg-primary text-primary-foreground px-8 py-9 md:px-12 mb-10 flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="display text-2xl md:text-3xl uppercase">
                  {trial.price === 0
                    ? 'Tu primera clase es gratis'
                    : `Clase de prueba — $${trial.price.toLocaleString('es-AR')}`}
                </p>
                <p className="text-sm text-primary-foreground max-w-md mt-3">
                  {trial.description || 'Vení a conocer el estudio y probá una clase, sin compromiso.'}
                </p>
              </div>
              {reservaPrueba && (
                <a
                  href={reservaPrueba}
                  target="_blank"
                  rel="noreferrer"
                  className="eyebrow text-[11px] group flex items-center gap-2 px-7 py-3.5 rounded-full bg-background text-foreground hover:opacity-85 transition-opacity"
                >
                  Reservar mi lugar
                  <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
              )}
            </div>
          </Reveal>
        )}

        {paid.length === 0 ? (
          <Reveal>
            {/* Sin canal escrito a mano: puede no haber WhatsApp cargado. */}
            <p className="text-sm text-foreground/60 text-center">
              Consultanos para conocer los planes vigentes.
            </p>
          </Reveal>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 items-stretch">
            {paid.map(({ plan, consulta, meses, mensual, sufijoPrecio }, i) => (
              <Reveal key={plan.id} delay={i * 80} className="h-full">
                <div
                  className={cn(
                    'group relative h-full rounded-[1.75rem] border border-foreground/25 bg-secondary p-7 md:p-8 flex flex-col transition-all duration-500 hover:-translate-y-1',
                    plan.popular && 'border-foreground shadow-[0_0_0_1px_var(--color-foreground)]'
                  )}
                >
                  {plan.popular && (
                    <span className="eyebrow absolute -top-2.5 left-7 text-[9px] px-3 py-1 rounded-full bg-foreground text-background">
                      El más elegido
                    </span>
                  )}

                  <h3 className="display text-2xl md:text-3xl uppercase text-foreground">{plan.name}</h3>
                  {plan.description && (
                    <p className="text-xs text-foreground/65 mt-2.5 leading-relaxed">{plan.description}</p>
                  )}

                  <div className="mt-7 mb-6 flex items-baseline gap-1.5">
                    <span className="display text-4xl md:text-[2.75rem] text-foreground">
                      ${plan.price.toLocaleString('es-AR')}
                    </span>
                    {/* Sin sufijo cuando el plan se mide en días: ahí
                        "/mes" promete otra cosa que lo que se cobra. */}
                    {sufijoPrecio && (
                      <span className="eyebrow text-[10px] text-foreground/60">{sufijoPrecio}</span>
                    )}
                  </div>

                  <ul className="eyebrow space-y-2.5 text-[10px] text-foreground/75 border-t border-foreground/15 pt-5">
                    <li>
                      {/* Las clases son las de toda la membresía, así que
                          "por mes" vale solo si la membresía dura un mes
                          (de ahí `mensual`). El plazo, en la línea de abajo. */}
                      {plan.class_count} {plural(plan.class_count, 'clase', 'clases')}
                      {mensual ? ' por mes' : ''}
                    </li>
                    <li>
                      {/* El mismo helper que Planes y el modal de asignación,
                          para que las tres pantallas digan una sola cosa. */}
                      {vigenciaTexto({
                        durationDays: plan.duration_days,
                        durationMonths: meses,
                      })}
                    </li>
                    {/* Sin clases cargadas la división da infinito: la base
                        no exige class_count > 0. */}
                    {plan.class_count > 0 && (
                      <li>
                        ${Math.round(plan.price / plan.class_count).toLocaleString('es-AR')} por clase
                      </li>
                    )}
                  </ul>

                  {plan.disciplines.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-6">
                      {plan.disciplines.map((d) => (
                        <span
                          key={d}
                          className="eyebrow text-[9px] px-2.5 py-1 rounded-full border border-foreground/25 text-foreground/70"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}

                  {consulta && (
                    <a
                      href={consulta}
                      target="_blank"
                      rel="noreferrer"
                      className="eyebrow mt-auto pt-7 text-[10px] text-foreground flex items-center gap-1.5 group-hover:gap-2.5 transition-all"
                    >
                      Consultar
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * El bloque OPEN STUDIO del manual: cuándo abre, dónde queda y el
 * estacionamiento. Todo sale de Configuración; lo que el estudio no cargó
 * no se dibuja.
 */
function OpenStudio() {
  const { studio } = useLanding()
  const mapa = useMapa()
  return (
    <section className="py-20 md:py-28 px-5">
      <Reveal className="max-w-xl mx-auto text-center">
        {/* `leading` con `!`: `.display` es CSS sin capa y le gana a la utilidad. */}
        <Titular className="text-3xl md:text-4xl leading-[0.95]!">
          Open
          <br />
          Studio
        </Titular>

        {/* El horario y la dirección se leen en renglones cortos y no en una
            frase corrida: "Lunes a viernes" arriba y "de 8 a 20 horas"
            abajo, con aire entre los dos bloques. Lo pidió así la clienta y
            los saltos viven en el dato, no acá — el estudio los edita desde
            Configuración sin tocar la página. */}
        {studio.openHours && (
          <div className="mt-10 space-y-7">
            {bloquesDeTexto(studio.openHours).map((bloque, b) => (
              <div key={b} className="space-y-1.5">
                {bloque.map((linea, i) => (
                  <p key={i} className="eyebrow text-[11px] md:text-sm text-foreground">
                    {linea}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}

        {studio.address && (
          <div className="mt-12 space-y-1.5">
            {bloquesDeTexto(studio.address).flat().map((linea, i) => (
              <p key={i} className="eyebrow text-[11px] md:text-sm text-foreground">
                {linea}
              </p>
            ))}
          </div>
        )}

        {mapa && (
          <a
            href={mapa}
            target="_blank"
            rel="noreferrer"
            // `pt-2` y no más margen: con 10px de letra el link mide 18px de
            // alto y en un teléfono es un objetivo incómodo. El padding crece
            // el área táctil a 26px sin mover el subrayado, que sigue pegado
            // al texto. El margen de arriba baja lo mismo que sube el padding,
            // así el aire que se ve no cambia.
            className="eyebrow text-[10px] inline-flex items-center gap-1.5 mt-4 pt-2 text-foreground hover:text-primary-fuerte transition-colors border-b border-current pb-0.5"
          >
            <MapPin className="w-3.5 h-3.5" />
            Cómo llegar
          </a>
        )}

        {studio.parking && (
          <p className="eyebrow font-bold text-[11px] md:text-sm text-foreground mt-10">
            {studio.parking}
          </p>
        )}
      </Reveal>
    </section>
  )
}

/**
 * Las disciplinas del catálogo, con la foto de la clienta cuando la hay.
 * Sin catálogo no se dibuja la sección: sacado el respaldo escrito a mano,
 * quedaría el título prometiendo disciplinas y abajo nada.
 */
function Disciplinas() {
  const { disciplines, disciplineNames } = useLanding()
  if (disciplineNames.length === 0) return null

  return (
    <section id="disciplinas" className="scroll-mt-24 border-t border-foreground/15">
      <div
        className={cn(
          'max-w-6xl mx-auto grid divide-y md:divide-y-0 md:divide-x divide-foreground/15',
          disciplineNames.length > 1 && 'md:grid-cols-2',
          disciplineNames.length > 2 && 'lg:grid-cols-3'
        )}
      >
        {disciplineNames.map((name, i) => {
          const s = disciplines[name] ?? ESTILO_GENERICO
          const foto = fotoDe(name)
          const lineas = lineasDelBlurb(s.blurb)
          return (
            <Reveal key={name} delay={i * 120} className="px-6 py-16 md:py-20 text-center">
              <Titular as="h3" className="text-3xl md:text-4xl leading-[0.95]">
                {name}
              </Titular>

              {foto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={foto}
                  alt={`Clase de ${name}`}
                  className="w-full max-w-xs mx-auto aspect-4/5 object-cover mt-9"
                />
              )}

              {lineas.length > 0 && (
                <div className={cn('space-y-1.5', foto ? 'mt-8' : 'mt-9')}>
                  {lineas.map((l) => (
                    <p key={l} className="eyebrow text-[10px] md:text-xs text-foreground/80">
                      {l}
                    </p>
                  ))}
                </div>
              )}
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

/** La grilla semanal publicada. Sin clases cargadas no se dibuja. */
function Horarios({ schedule }: { schedule: PublicClass[] }) {
  const { disciplines } = useLanding()
  const todayIdx = Math.min((new Date().getDay() + 6) % 7, 5)
  const [day, setDay] = useState(todayIdx)
  if (schedule.length === 0) return null

  const ofDay = schedule
    .filter((c) => c.day_of_week === day)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  return (
    <section id="horarios" className="scroll-mt-24 py-20 md:py-28 bg-muted">
      <div className="max-w-4xl mx-auto px-5">
        <Reveal className="text-center mb-12">
          <Rotulo>Horarios</Rotulo>
          <Titular className="text-[9vw] sm:text-5xl md:text-6xl mt-5">
            La semana
          </Titular>
        </Reveal>

        <Reveal delay={100}>
          <div className="flex justify-center gap-1 flex-wrap mb-10">
            {DAYS.map((d, i) => (
              <button
                key={d}
                onClick={() => setDay(i)}
                className={cn(
                  'eyebrow text-[10px] px-4 py-2.5 rounded-full transition-colors duration-300',
                  day === i
                    ? 'bg-foreground text-background'
                    : 'border border-foreground/20 text-foreground/60 hover:border-foreground hover:text-foreground'
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Reveal>

        <div key={day} className="divide-y divide-foreground/10 border-y border-foreground/10">
          {ofDay.length === 0 ? (
            <p className="fade-up eyebrow text-center text-[10px] text-foreground/50 py-12">
              No hay clases programadas este día.
            </p>
          ) : (
            ofDay.map((c, i) => {
              const s = disciplines[c.discipline] ?? ESTILO_GENERICO
              return (
                <div
                  key={c.id}
                  className="fade-up flex items-center gap-4 px-1 py-4 hover:bg-background/60 transition-colors"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="w-16 shrink-0">
                    <p className="display text-lg text-foreground">{c.start_time.slice(0, 5)}</p>
                    <p className="eyebrow text-[9px] text-foreground/50">{c.duration_minutes}min</p>
                  </div>
                  {/* El color lo pone el catálogo de disciplinas, no la hoja de estilos. */}
                  <div className="w-px self-stretch" style={{ backgroundColor: s.dot }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                    <p className="eyebrow text-[9px] text-foreground/55 truncate mt-1">
                      {c.teacher_name} · {c.room}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 eyebrow text-[9px] text-foreground/55 shrink-0">
                    <Users className="w-3.5 h-3.5" />
                    hasta {c.capacity}
                  </div>
                  <span
                    className="hidden md:inline-block eyebrow text-[9px] px-2.5 py-1 rounded-full shrink-0"
                    style={{ backgroundColor: s.bg, color: s.text }}
                  >
                    {c.discipline}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <Reveal delay={120}>
          <p className="eyebrow text-center text-[10px] text-foreground/50 mt-8">
            Los cupos se reservan por orden de llegada
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function Cita() {
  const imgRef = useParallax(-0.1)
  return (
    <section className="relative py-32 md:py-40 overflow-hidden">
      <div ref={imgRef} className="absolute -inset-y-20 inset-x-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marca/estudio-sala.jpg"
          alt=""
          aria-hidden
          className="w-full h-full object-cover scale-110"
        />
        <div aria-hidden className="absolute inset-0 bg-foreground/65" />
      </div>
      <Reveal className="relative max-w-3xl mx-auto px-5 text-center">
        {/* Copy de la clienta (12/09), y es de ella: acá había una cita de
            Joseph Pilates con su firma debajo. La firma se fue con la cita —
            dejarla sería atribuirle a él una frase que escribió ella. Las
            comillas también: sin autor no es una cita, es lo que el estudio
            dice. Rima con el cierre de su bajada, "el movimiento se convierte
            en pausa", que es de la misma mano. */}
        <p className="display text-3xl md:text-5xl text-background leading-tight!">
          Moverte también puede ser tu pausa.
        </p>
      </Reveal>
    </section>
  )
}

function Contacto({ plans }: { plans: PublicPlan[] }) {
  const { studio } = useLanding()
  const wa = useWa()
  const empezar = wa('¡Hola! Me gustaría empezar. ¿Me cuentan cómo arranco? 💪')
  // La clase de prueba se regala solo si el estudio la puso en cero: el
  // precio lo pone él y arriba, en Planes, se muestra el que cargó. Escrita
  // sin condición, la página se contradecía a dos secciones de distancia.
  const pruebaGratis = plans.some((p) => p.is_trial && p.price === 0)

  return (
    <section id="contacto" className="scroll-mt-24 py-20 md:py-28 px-5">
      <Reveal className="max-w-2xl mx-auto text-center">
        <Rotulo>Contacto</Rotulo>
        {/* Copy de la clienta (12/09). Sin el punto final que traía su
            mensaje: ninguno de los otros titulares lo lleva, y en la Bodoni
            en mayúsculas de 60 px un punto suelto al final se lee como un
            error de tipeo y no como puntuación. */}
        <Titular className="text-[9vw] sm:text-5xl md:text-6xl mt-5">
          Empezá por una clase
        </Titular>
        <p className="text-sm md:text-base text-foreground/70 mt-7 max-w-lg mx-auto leading-relaxed">
          Contanos qué estás buscando y te ayudamos a elegir la frecuencia
          ideal para vos.
          {pruebaGratis ? ' La primera clase corre por nuestra cuenta.' : ''}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
          {/* Sin WhatsApp cargado, el mail es el canal: el cierre de la
              página no puede quedar sin acción. */}
          <a
            href={empezar ?? `mailto:${studio.email}`}
            target={empezar ? '_blank' : undefined}
            rel={empezar ? 'noreferrer' : undefined}
            className="eyebrow text-[11px] flex items-center gap-2 px-8 py-3.5 rounded-full bg-foreground text-background hover:opacity-85 transition-opacity"
          >
            {empezar ? <MessageCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
            {empezar ? 'Escribinos por WhatsApp' : 'Escribinos por mail'}
          </a>
          <a
            href={`https://instagram.com/${studio.instagram}`}
            target="_blank"
            rel="noreferrer"
            className="eyebrow text-[11px] flex items-center gap-2 px-8 py-3.5 rounded-full border border-foreground text-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            <Instagram className="w-4 h-4" />
            Instagram
          </a>
        </div>

        {studio.email && (
          <a
            href={`mailto:${studio.email}`}
            className="eyebrow text-[10px] inline-block mt-8 text-foreground/60 hover:text-foreground transition-colors"
          >
            {studio.email}
          </a>
        )}

      </Reveal>
    </section>
  )
}

/** La acuarela con la que cierra el manual, y abajo el pie. */
function Footer() {
  const { studio } = useLanding()
  const wa = useWa()
  const saludo = wa('¡Hola! Quería hacerles una consulta.')
  const mapa = useMapa()
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* El encuadre bajo, y no el centrado: la acuarela es 1600x800 y en una
          pantalla ancha el recorte se comía el barquito, que está al 70% de
          alto. Con el foco ahí, la franja lo deja entero en cualquier ancho
          —se verificó de 375 a 2560— y sigue mostrando la palmera. */}
      <img
        src="/marca/paisaje.jpg"
        alt=""
        aria-hidden
        className="w-full h-[38vh] min-h-[220px] max-h-[460px] object-cover object-[50%_72%]"
      />
      {/* El pie en natural y no en negro: lo pidió la clienta. El diseño es
          el mismo; lo que cambia es de qué lado está el contraste, y por eso
          las opacidades suben — sobre el natural, el negro recién pasa AA
          desde el 60%, mientras que sobre el negro el blanco pasaba al 45%. */}
      <footer className="bg-background text-foreground/70 border-t border-foreground/10">
        <div className="max-w-6xl mx-auto px-5 py-14">
          <div className="flex flex-wrap items-start justify-between gap-10">
            <div>
              <p className="display text-2xl uppercase text-foreground">{studio.name}</p>
              <p className="eyebrow text-[9px] text-foreground/65 mt-2">{MARCA.bajo}</p>
              {studio.address && (
                <div className="text-xs text-foreground/70 max-w-xs leading-relaxed mt-5 space-y-0.5">
                  {bloquesDeTexto(studio.address).flat().map((linea, i) => (
                    <p key={i}>{linea}</p>
                  ))}
                </div>
              )}
              {/* El pie es donde alguien decide si viene, así que la dirección
                  tiene que poder abrirse en el mapa desde acá y no solo
                  arriba, en Open Studio. */}
              {mapa && (
                <a
                  href={mapa}
                  target="_blank"
                  rel="noreferrer"
                  className="eyebrow text-[9px] inline-flex items-center gap-1.5 mt-2 pt-2 text-foreground/70 hover:text-foreground transition-colors border-b border-current pb-0.5"
                >
                  <MapPin className="w-3 h-3" />
                  Ver en Google Maps
                </a>
              )}
            </div>

            <nav className="flex gap-12 text-xs">
              <div className="flex flex-col gap-3">
                <p className="eyebrow text-[9px] text-foreground/65">Estudio</p>
                <a href="#disciplinas" className="hover:text-foreground transition-colors">Disciplinas</a>
                <a href="#planes" className="hover:text-foreground transition-colors">Planes</a>
                <a href="#horarios" className="hover:text-foreground transition-colors">Horarios</a>
              </div>
              <div className="flex flex-col gap-3">
                <p className="eyebrow text-[9px] text-foreground/65">Seguinos</p>
                <a href={`https://instagram.com/${studio.instagram}`} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">Instagram</a>
                {saludo && (
                  <a href={saludo} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">WhatsApp</a>
                )}
              </div>
            </nav>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-12 pt-6 border-t border-foreground/15 eyebrow text-[9px] text-foreground/65">
            <p>© {new Date().getFullYear()} {studio.name}</p>
            <Link href="/sistema" className="hover:text-foreground transition-colors">
              Acceso al sistema
            </Link>
          </div>
        </div>
      </footer>
    </>
  )
}

// ---------------------------------------------------------------
// Página
// ---------------------------------------------------------------
export function LandingPage() {
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [schedule, setSchedule] = useState<PublicClass[]>([])
  const [landing, setLanding] = useState<LandingData>({
    studio: STUDIO_FALLBACK,
    disciplines: DISCIPLINE_FALLBACK,
    disciplineNames: Object.keys(DISCIPLINE_FALLBACK),
  })

  useEffect(() => {
    supabase
      .from('public_plans')
      .select('*')
      .then(({ data }) => setPlans((data as PublicPlan[]) ?? []))
    supabase
      .from('public_schedule')
      .select('*')
      .then(({ data }) => setSchedule((data as PublicClass[]) ?? []))

    // Datos del estudio y disciplinas, editables desde Configuración
    // (migración 0011). Si algo falta, queda el respaldo de arriba.
    Promise.all([
      supabase.from('public_studio_settings').select('key, value'),
      supabase.from('public_disciplines').select('*'),
    ]).then(([settingsRes, discRes]) => {
      const rows = (settingsRes.data ?? []) as Array<{ key: string; value: string }>
      const map = new Map(rows.map((r) => [r.key, r.value?.trim() ?? '']))
      const pick = (key: string, fallback: string) => map.get(key) || fallback

      const discRows = (discRes.data ?? []) as Array<{
        name: string
        color: string
        bg_color: string
        text_color: string
        blurb: string
      }>

      setLanding((prev) => ({
        studio: {
          ...prev.studio,
          name: pick('studio_name', STUDIO_FALLBACK.name),
          address: pick('studio_address', STUDIO_FALLBACK.address),
          mapsUrl: pick('studio_maps_url', STUDIO_FALLBACK.mapsUrl),
          whatsapp: pick('studio_whatsapp', STUDIO_FALLBACK.whatsapp),
          instagram: pick('studio_instagram', STUDIO_FALLBACK.instagram),
          email: pick('studio_email', STUDIO_FALLBACK.email),
          openHours: pick('studio_hours', STUDIO_FALLBACK.openHours),
          parking: pick('studio_parking', STUDIO_FALLBACK.parking),
        },
        disciplines: discRows.length
          ? Object.fromEntries(
              discRows.map((d) => [
                d.name,
                { dot: d.color, bg: d.bg_color, text: d.text_color, blurb: d.blurb ?? '' },
              ])
            )
          : prev.disciplines,
        disciplineNames: discRows.length ? discRows.map((d) => d.name) : prev.disciplineNames,
      }))
    })
  }, [])

  return (
    <LandingCtx.Provider value={landing}>
      <main className="overflow-x-clip">
        <Nav />
        <Hero />
        <Bajada />
        <Estudio schedule={schedule} />
        <Planes plans={plans} />
        <OpenStudio />
        <Disciplinas />
        <Horarios schedule={schedule} />
        <Cita />
        <Contacto plans={plans} />
        <Footer />
      </main>
    </LandingCtx.Provider>
  )
}
