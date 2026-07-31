'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------
// Datos del estudio — editar acá para personalizar la landing
// ---------------------------------------------------------------
const STUDIO = {
  name: 'PilatesStudio',
  city: 'San Miguel de Tucumán',
  address: 'Av. Aconquija 1200, Yerba Buena, Tucumán',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Av.+Aconquija+1200+Yerba+Buena+Tucuman',
  whatsapp: '5493813007791', // solo dígitos, con código de país
  instagram: 'pilatestudio',
  facebook: 'pilatestudio',
  email: 'hola@pilatestudio.com',
  openHours: 'Lun a Vie 7:00–21:00 · Sáb 9:00–13:00',
}

const wa = (text: string) =>
  `https://wa.me/${STUDIO.whatsapp}?text=${encodeURIComponent(text)}`

const DISCIPLINE_STYLE: Record<string, { dot: string; bg: string; text: string; blurb: string }> = {
  'Pilates Mat': {
    dot: '#C4735A', bg: '#FDEEE8', text: '#8B3A25',
    blurb: 'Fuerza y control desde el centro del cuerpo, en colchoneta. La base de todo.',
  },
  'Pilates Reformer': {
    dot: '#7D9B76', bg: '#E8F2EB', text: '#2E6040',
    blurb: 'Resistencia con resortes para trabajar profundo, con precisión y sin impacto.',
  },
  'Pilates Clínico': {
    dot: '#9B6E8E', bg: '#F0EAF5', text: '#5A2F72',
    blurb: 'Rehabilitación y trabajo postural guiado, indicado junto a tu médico o kinesiólogo.',
  },
  Yoga: {
    dot: '#D4A854', bg: '#FDF5E6', text: '#7A5A1A',
    blurb: 'Respiración, flexibilidad y calma. El contrapeso perfecto para tu semana.',
  },
  Stretching: {
    dot: '#5E8FA8', bg: '#E6EFF5', text: '#1A4D6A',
    blurb: 'Movilidad y elongación profunda para descomprimir el cuerpo.',
  },
  Funcional: {
    dot: '#B8956A', bg: '#F5EDE0', text: '#6A4A1A',
    blurb: 'Fuerza aplicada a movimientos reales. Energía pura en grupos chicos.',
  },
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function Instagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function Facebook({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

interface PublicPlan {
  id: string
  name: string
  price: number
  class_count: number
  duration_days: number
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

/** Inclinación 3D siguiendo el mouse. */
function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `perspective(800px) rotateY(${px * 7}deg) rotateX(${py * -7}deg) translateY(-4px)`
  }
  const onLeave = () => {
    const el = ref.current
    if (el) el.style.transform = ''
  }
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn('transition-transform duration-300 will-change-transform', className)}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { href: '#estudio', label: 'El estudio' },
    { href: '#disciplinas', label: 'Disciplinas' },
    { href: '#planes', label: 'Planes' },
    { href: '#horarios', label: 'Horarios' },
    { href: '#contacto', label: 'Contacto' },
  ]

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-all duration-500',
        scrolled || menuOpen
          ? 'bg-background/90 backdrop-blur-md shadow-sm py-2.5'
          : 'bg-transparent py-5'
      )}
    >
      <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-serif font-bold text-base">P</span>
          </div>
          <span className="font-serif font-semibold text-foreground text-lg">{STUDIO.name}</span>
        </a>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/sistema"
            className="px-4 py-2 rounded-xl border border-foreground/15 text-sm font-semibold text-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            Ingresar
          </Link>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            className="md:hidden w-10 h-10 rounded-xl border border-foreground/15 flex items-center justify-center text-foreground"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
        <nav className="px-5 pt-3 pb-5 flex flex-col gap-1 bg-background/90 backdrop-blur-md">
          {links.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'py-3 px-2 rounded-xl text-base font-medium text-foreground/80 hover:bg-primary/8 hover:text-primary transition-all border-b border-border/60 last:border-0',
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

function Hero() {
  const words = ['Fuerza,', 'control', 'y', 'calma.']
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Imagen de fondo con zoom lento */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pilates.jpg"
          alt="Clase de Pilates Reformer en el estudio"
          className="w-full h-full object-cover kenburns"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/75 md:via-background/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="relative max-w-6xl mx-auto px-5 w-full pt-28 pb-24">
        <div className="max-w-xl">
          <p className="fade-up text-[11px] md:text-xs font-bold tracking-[0.3em] text-primary uppercase mb-5" style={{ animationDelay: '200ms' }}>
            Estudio de Pilates · {STUDIO.city}
          </p>

          <h1 className="font-serif text-5xl md:text-7xl leading-[1.04] text-foreground mb-6">
            {words.map((w, i) => (
              <span key={w} className="word-mask mr-[0.22em]">
                <span
                  className={cn('word-rise', (w === 'control' || w === 'calma.') && 'italic text-primary')}
                  style={{ animationDelay: `${300 + i * 120}ms` }}
                >
                  {w}
                </span>
              </span>
            ))}
            <br />
            <span className="word-mask">
              <span className="word-rise text-3xl md:text-5xl text-foreground/70" style={{ animationDelay: '800ms' }}>
                En cada movimiento.
              </span>
            </span>
          </h1>

          <p className="fade-up text-base md:text-lg text-foreground/70 leading-relaxed mb-9 max-w-md" style={{ animationDelay: '950ms' }}>
            Grupos reducidos, seguimiento real y un espacio pensado para que tu
            cuerpo trabaje mejor — sea cual sea tu punto de partida.
          </p>

          <div className="fade-up flex flex-wrap items-center gap-3" style={{ animationDelay: '1100ms' }}>
            <a
              href={wa('¡Hola! Quiero reservar mi primera clase de prueba 🙌')}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Probá tu primera clase
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#planes"
              className="px-6 py-3.5 rounded-2xl border border-foreground/20 text-sm font-bold text-foreground hover:bg-foreground hover:text-background transition-colors"
            >
              Ver planes
            </a>
          </div>
        </div>
      </div>

      {/* Chips flotantes */}
      <div className="absolute right-10 top-1/3 hidden lg:flex flex-col gap-4">
        <div className="float-y bg-background/80 backdrop-blur rounded-2xl px-5 py-4 shadow-lg border border-border">
          <p className="text-2xl font-bold text-foreground">23</p>
          <p className="text-xs text-muted-foreground">clases por semana</p>
        </div>
        <div className="float-y-slow bg-background/80 backdrop-blur rounded-2xl px-5 py-4 shadow-lg border border-border ml-10">
          <p className="text-2xl font-bold text-foreground">4–12</p>
          <p className="text-xs text-muted-foreground">personas por clase</p>
        </div>
      </div>

      <a
        href="#estudio"
        aria-label="Bajar al contenido"
        className="absolute bottom-7 left-1/2 -translate-x-1/2 text-foreground/50 hover:text-primary transition-colors"
      >
        <ChevronDown className="w-6 h-6 scroll-hint" />
      </a>
    </section>
  )
}

function Marquee() {
  const items = Object.keys(DISCIPLINE_STYLE)
  const row = [...items, ...items, ...items]
  return (
    <div className="relative -rotate-2 -mx-4 my-2 z-10">
      <div className="bg-primary py-3.5 overflow-hidden shadow-md">
        <div className="marquee-track">
          {[0, 1].map((half) => (
            <div key={half} className="flex shrink-0">
              {row.map((item, i) => (
                <span
                  key={`${half}-${i}`}
                  className="font-serif italic text-primary-foreground/95 text-lg md:text-xl whitespace-nowrap px-6 flex items-center gap-6"
                >
                  {item} <span className="text-primary-foreground/50 not-italic text-sm">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Estudio({ schedule }: { schedule: PublicClass[] }) {
  const imgRef = useParallax(0.06)
  const stats = {
    classes: schedule.length || 23,
    disciplines: schedule.length ? new Set(schedule.map((c) => c.discipline)).size : 6,
    teachers: schedule.length ? new Set(schedule.map((c) => c.teacher_name)).size : 4,
    rooms: schedule.length ? new Set(schedule.map((c) => c.room)).size : 3,
  }

  return (
    <section id="estudio" className="relative py-24 md:py-32 overflow-hidden">
      <span
        aria-hidden
        className="text-outline font-serif absolute -top-4 left-0 text-[22vw] leading-none font-bold select-none pointer-events-none"
      >
        Pilates
      </span>

      <div className="relative max-w-6xl mx-auto px-5 grid md:grid-cols-2 gap-14 items-center">
        <div>
          <Reveal>
            <p className="text-[11px] font-bold tracking-[0.3em] text-primary uppercase mb-4">El estudio</p>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="font-serif text-4xl md:text-5xl text-foreground leading-tight mb-6">
              Un espacio para <em className="text-primary">moverte bien</em>, a tu ritmo
            </h2>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-foreground/70 leading-relaxed mb-8">
              No creemos en clases multitudinarias ni en rutinas copiadas. Cada
              persona entra con una historia distinta — una lesión, un objetivo,
              unas ganas — y el plan se arma alrededor de eso. Equipamiento
              completo de Reformer, profesoras certificadas y grupos chicos donde
              tu nombre se conoce desde el primer día.
            </p>
          </Reveal>

          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {[
              { n: stats.classes, suffix: '', label: 'clases por semana' },
              { n: stats.disciplines, suffix: '', label: 'disciplinas' },
              { n: stats.teachers, suffix: '', label: 'instructores certificados' },
              { n: stats.rooms, suffix: '', label: 'salas equipadas' },
            ].map((s, i) => (
              <Reveal key={s.label} delay={250 + i * 100}>
                <div className="border-l-2 border-primary/40 pl-4">
                  <p className="text-4xl font-bold text-foreground font-serif">
                    <Counter target={s.n} suffix={s.suffix} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={150} className="relative">
          <div className="absolute -inset-3 translate-x-6 translate-y-6 rounded-[2rem] border-2 border-primary/25" />
          <div ref={imgRef} className="relative rounded-[2rem] overflow-hidden shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Pilates2.jpg"
              alt="Alumnos en clase de Reformer"
              className="w-full h-[420px] md:h-[520px] object-cover hover:scale-105 transition-transform duration-700"
            />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Disciplinas() {
  return (
    <section id="disciplinas" className="py-24 bg-foreground/[0.025]">
      <div className="max-w-6xl mx-auto px-5">
        <Reveal>
          <p className="text-[11px] font-bold tracking-[0.3em] text-primary uppercase mb-4">Disciplinas</p>
        </Reveal>
        <div className="flex items-end justify-between gap-6 flex-wrap mb-12">
          <Reveal delay={100}>
            <h2 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
              Seis maneras de <em className="text-primary">volver al cuerpo</em>
            </h2>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-sm text-foreground/60 max-w-xs">
              Todas combinables entre sí según tu plan. Empezá por una, probalas todas.
            </p>
          </Reveal>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Object.entries(DISCIPLINE_STYLE).map(([name, s], i) => (
            <Reveal key={name} delay={i * 90}>
              <div
                className="group relative rounded-3xl border border-border bg-card p-7 overflow-hidden transition-all duration-500 hover:-translate-y-1.5 hover:shadow-xl cursor-default h-full"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ backgroundColor: s.bg }}
                />
                <div className="relative">
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-xs font-bold text-muted-foreground/60">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className="w-3 h-3 rounded-full transition-transform duration-500 group-hover:scale-[1.8]"
                      style={{ backgroundColor: s.dot }}
                    />
                  </div>
                  <h3
                    className="font-serif text-2xl text-foreground mb-2.5 transition-colors duration-500"
                    style={{ color: undefined }}
                  >
                    {name}
                  </h3>
                  <p className="text-sm leading-relaxed text-foreground/60">{s.blurb}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Planes({ plans }: { plans: PublicPlan[] }) {
  const trial = plans.find((p) => p.is_trial)
  const paid = plans.filter((p) => !p.is_trial).sort((a, b) => a.price - b.price)

  return (
    <section id="planes" className="py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-5">
        <Reveal>
          <p className="text-[11px] font-bold tracking-[0.3em] text-primary uppercase mb-4">Planes</p>
        </Reveal>
        <Reveal delay={100}>
          <h2 className="font-serif text-4xl md:text-5xl text-foreground leading-tight mb-4">
            Planes simples, <em className="text-primary">sin letra chica</em>
          </h2>
        </Reveal>
        <Reveal delay={180}>
          <p className="text-foreground/60 max-w-lg mb-12">
            Elegí cuántas veces por semana querés venir y qué disciplinas querés
            combinar. Sin matrícula, sin permanencia mínima.
          </p>
        </Reveal>

        {trial && (
          <Reveal delay={220}>
            <div className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground p-8 md:p-10 mb-10 flex flex-wrap items-center justify-between gap-6 shadow-xl shadow-primary/20">
              <div className="absolute -right-10 -top-14 w-52 h-52 rounded-full bg-primary-foreground/10" />
              <div className="absolute -right-24 top-10 w-52 h-52 rounded-full bg-primary-foreground/5" />
              <div className="relative">
                <p className="font-serif italic text-2xl md:text-3xl mb-1.5">
                  {trial.price === 0 ? 'Tu primera clase es gratis' : `Clase de prueba — $${trial.price.toLocaleString('es-AR')}`}
                </p>
                <p className="text-sm text-primary-foreground/80 max-w-md">
                  {trial.description || 'Veni a conocer el estudio y probá la disciplina que quieras, sin compromiso.'}
                </p>
              </div>
              <a
                href={wa('¡Hola! Quiero reservar mi clase de prueba ✨')}
                target="_blank"
                rel="noreferrer"
                className="relative group flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-primary-foreground text-primary text-sm font-bold hover:-translate-y-0.5 transition-transform"
              >
                Reservar mi lugar
                <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>
          </Reveal>
        )}

        {paid.length === 0 ? (
          <Reveal>
            <p className="text-sm text-muted-foreground">
              Consultanos por WhatsApp para conocer los planes vigentes.
            </p>
          </Reveal>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {paid.map((plan, i) => (
              <Reveal key={plan.id} delay={i * 100} className="h-full">
                <TiltCard className="h-full">
                  <div
                    className={cn(
                      'relative h-full rounded-3xl border bg-card overflow-hidden flex flex-col',
                      plan.popular ? 'border-primary shadow-xl shadow-primary/10' : 'border-border shadow-sm'
                    )}
                  >
                    {plan.popular && (
                      <span className="absolute top-4 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary text-primary-foreground">
                        El más elegido
                      </span>
                    )}
                    <div className="h-1.5" style={{ backgroundColor: plan.color }} />
                    <div className="p-7 flex flex-col flex-1">
                      <h3 className="font-serif text-2xl text-foreground">{plan.name}</h3>
                      <p className="text-xs text-foreground/55 mt-1 mb-5 min-h-8">{plan.description}</p>

                      <div className="mb-5">
                        <span className="text-4xl font-bold text-foreground">
                          ${plan.price.toLocaleString('es-AR')}
                        </span>
                        <span className="text-sm text-muted-foreground">/mes</span>
                      </div>

                      <ul className="space-y-2 text-sm text-foreground/70 mb-5">
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: plan.color }} />
                          {plan.class_count} clases por mes
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: plan.color }} />
                          Vigencia {plan.duration_days} días
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: plan.color }} />
                          ${Math.round(plan.price / plan.class_count).toLocaleString('es-AR')} por clase
                        </li>
                      </ul>

                      <div className="flex flex-wrap gap-1.5 mb-7">
                        {plan.disciplines.map((d) => (
                          <span
                            key={d}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${plan.color}18`,
                              color: plan.color,
                            }}
                          >
                            {d}
                          </span>
                        ))}
                      </div>

                      <a
                        href={wa(`¡Hola! Me interesa el plan ${plan.name} 🧘`)}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          'mt-auto text-center py-3 rounded-2xl text-sm font-bold transition-all',
                          plan.popular
                            ? 'bg-primary text-primary-foreground hover:opacity-90'
                            : 'border border-foreground/15 text-foreground hover:bg-foreground hover:text-background'
                        )}
                      >
                        Consultar por este plan
                      </a>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Horarios({ schedule }: { schedule: PublicClass[] }) {
  const todayIdx = Math.min((new Date().getDay() + 6) % 7, 5)
  const [day, setDay] = useState(todayIdx)
  if (schedule.length === 0) return null

  const ofDay = schedule
    .filter((c) => c.day_of_week === day)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  return (
    <section id="horarios" className="py-24 bg-foreground/[0.025]">
      <div className="max-w-4xl mx-auto px-5">
        <Reveal>
          <p className="text-[11px] font-bold tracking-[0.3em] text-primary uppercase mb-4 text-center">Horarios</p>
        </Reveal>
        <Reveal delay={100}>
          <h2 className="font-serif text-4xl md:text-5xl text-foreground leading-tight mb-10 text-center">
            La grilla de <em className="text-primary">esta semana</em>
          </h2>
        </Reveal>

        <Reveal delay={200}>
          <div className="flex justify-center gap-1.5 flex-wrap mb-9">
            {DAYS.map((d, i) => (
              <button
                key={d}
                onClick={() => setDay(i)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300',
                  day === i
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-105'
                    : 'bg-card border border-border text-foreground/60 hover:border-primary/40 hover:text-foreground'
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Reveal>

        <div key={day} className="space-y-2.5">
          {ofDay.length === 0 ? (
            <p className="fade-up text-center text-sm text-muted-foreground py-10">
              No hay clases programadas este día.
            </p>
          ) : (
            ofDay.map((c, i) => {
              const s = DISCIPLINE_STYLE[c.discipline]
              return (
                <div
                  key={c.id}
                  className="fade-up flex items-center gap-4 bg-card rounded-2xl border border-border px-5 py-4 hover:shadow-md hover:border-primary/30 transition-all"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-base font-bold text-foreground">{c.start_time.slice(0, 5)}</p>
                    <p className="text-[10px] text-muted-foreground">{c.duration_minutes}min</p>
                  </div>
                  <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: s?.dot ?? '#C4735A' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.teacher_name} · {c.room}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <Users className="w-3.5 h-3.5" />
                    hasta {c.capacity}
                  </div>
                  <span
                    className="hidden md:inline-block text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                    style={{ backgroundColor: s?.bg, color: s?.text }}
                  >
                    {c.discipline}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <Reveal delay={150}>
          <p className="text-center text-xs text-muted-foreground mt-8">
            Los cupos se reservan por orden de llegada — escribinos para asegurar tu lugar.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function Quote() {
  const imgRef = useParallax(-0.12)
  return (
    <section className="relative py-36 md:py-44 overflow-hidden">
      <div ref={imgRef} className="absolute -inset-y-20 inset-x-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pilates3.jpg"
          alt=""
          aria-hidden
          className="w-full h-full object-cover scale-110"
        />
        <div className="absolute inset-0 bg-foreground/70" />
      </div>
      <Reveal className="relative max-w-3xl mx-auto px-5 text-center">
        <p className="font-serif italic text-3xl md:text-5xl text-background leading-snug mb-6">
          “La aptitud física es el primer requisito de la felicidad.”
        </p>
        <p className="text-xs font-bold tracking-[0.3em] uppercase text-background/70">
          Joseph Pilates
        </p>
      </Reveal>
    </section>
  )
}

function Contacto() {
  return (
    <section id="contacto" className="py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-5 grid md:grid-cols-2 gap-8 items-stretch">
        <Reveal>
          <div className="h-full bg-card rounded-3xl border border-border p-8 md:p-10">
            <p className="text-[11px] font-bold tracking-[0.3em] text-primary uppercase mb-4">Contacto</p>
            <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-8">
              Vení a <em className="text-primary">conocernos</em>
            </h2>

            <ul className="space-y-5">
              <li className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-4.5 h-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{STUDIO.address}</p>
                  <a
                    href={STUDIO.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary font-medium hover:underline"
                  >
                    Cómo llegar →
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock className="w-4.5 h-4.5 text-primary" />
                </div>
                <p className="text-sm text-foreground/75 pt-2">{STUDIO.openHours}</p>
              </li>
              <li className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="w-4.5 h-4.5 text-primary" />
                </div>
                <a
                  href={`mailto:${STUDIO.email}`}
                  className="text-sm text-foreground/75 pt-2 hover:text-primary transition-colors"
                >
                  {STUDIO.email}
                </a>
              </li>
            </ul>

            <div className="flex gap-2.5 mt-9">
              <a
                href={`https://instagram.com/${STUDIO.instagram}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-foreground/60 hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all hover:-translate-y-0.5"
              >
                <Instagram className="w-4.5 h-4.5" />
              </a>
              <a
                href={`https://facebook.com/${STUDIO.facebook}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
                className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-foreground/60 hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all hover:-translate-y-0.5"
              >
                <Facebook className="w-4.5 h-4.5" />
              </a>
              <a
                href={wa('¡Hola! Quiero más info del estudio 🙂')}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-foreground/60 hover:bg-[#25D366] hover:border-[#25D366] hover:text-white transition-all hover:-translate-y-0.5"
              >
                <MessageCircle className="w-4.5 h-4.5" />
              </a>
            </div>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <div className="relative h-full overflow-hidden rounded-3xl bg-primary text-primary-foreground p-8 md:p-10 flex flex-col justify-between shadow-xl shadow-primary/20">
            <div className="absolute -right-16 -bottom-24 w-72 h-72 rounded-full bg-primary-foreground/10" />
            <div className="absolute -right-4 -bottom-32 w-72 h-72 rounded-full bg-primary-foreground/5" />
            <div className="relative">
              <p className="font-serif italic text-3xl md:text-4xl leading-snug mb-4">
                ¿Empezamos esta semana?
              </p>
              <p className="text-sm text-primary-foreground/80 max-w-sm leading-relaxed">
                Escribinos por WhatsApp, contanos tu punto de partida y te
                recomendamos por dónde arrancar. La primera clase corre por
                nuestra cuenta.
              </p>
            </div>
            <a
              href={wa('¡Hola! Quiero empezar esta semana 💪')}
              target="_blank"
              rel="noreferrer"
              className="relative group mt-10 flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary-foreground text-primary text-sm font-bold hover:-translate-y-0.5 transition-transform"
            >
              <MessageCircle className="w-4 h-4" />
              Escribinos por WhatsApp
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-foreground text-background/80">
      <div className="max-w-6xl mx-auto px-5 py-14">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-serif font-bold text-base">P</span>
              </div>
              <span className="font-serif font-semibold text-background text-lg">{STUDIO.name}</span>
            </div>
            <p className="text-xs text-background/50 max-w-xs leading-relaxed">
              Estudio de Pilates y movimiento en {STUDIO.city}. {STUDIO.openHours}.
            </p>
          </div>

          <nav className="flex gap-10 text-sm">
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-background/40 mb-1">Estudio</p>
              <a href="#disciplinas" className="hover:text-background transition-colors">Disciplinas</a>
              <a href="#planes" className="hover:text-background transition-colors">Planes</a>
              <a href="#horarios" className="hover:text-background transition-colors">Horarios</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-background/40 mb-1">Seguinos</p>
              <a href={`https://instagram.com/${STUDIO.instagram}`} target="_blank" rel="noreferrer" className="hover:text-background transition-colors">Instagram</a>
              <a href={`https://facebook.com/${STUDIO.facebook}`} target="_blank" rel="noreferrer" className="hover:text-background transition-colors">Facebook</a>
              <a href={wa('¡Hola!')} target="_blank" rel="noreferrer" className="hover:text-background transition-colors">WhatsApp</a>
            </div>
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-12 pt-6 border-t border-background/10 text-xs text-background/40">
          <p>© {new Date().getFullYear()} {STUDIO.name}. Todos los derechos reservados.</p>
          <Link href="/sistema" className="hover:text-background/70 transition-colors">
            Acceso al sistema
          </Link>
        </div>
      </div>
    </footer>
  )
}

// ---------------------------------------------------------------
// Página
// ---------------------------------------------------------------
export function LandingPage() {
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [schedule, setSchedule] = useState<PublicClass[]>([])

  useEffect(() => {
    supabase
      .from('public_plans')
      .select('*')
      .then(({ data }) => setPlans((data as PublicPlan[]) ?? []))
    supabase
      .from('public_schedule')
      .select('*')
      .then(({ data }) => setSchedule((data as PublicClass[]) ?? []))
  }, [])

  return (
    <main className="overflow-x-clip">
      <Nav />
      <Hero />
      <Marquee />
      <Estudio schedule={schedule} />
      <Disciplinas />
      <Planes plans={plans} />
      <Horarios schedule={schedule} />
      <Quote />
      <Contacto />
      <Footer />
    </main>
  )
}
