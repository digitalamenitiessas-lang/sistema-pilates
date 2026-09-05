'use client'

import { useState } from 'react'

import {
  Users,
  CalendarCheck,
  TrendingUp,
  AlertTriangle,
  Clock,
  ChevronRight,
  ArrowUpRight,
  Flame,
  CreditCard,
  MessageCircle,
  ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import { TomarAsistencia } from '@/components/asistencia/tomar-asistencia'
import { localISO, todayDayIndex } from '@/lib/api'
import { paymentReminderLink } from '../pagos/pagos-page'
import type { PageKey } from '../layout/sidebar'

/** Link de WhatsApp para avisar al alumno lo que dice la alerta. */
function alertReminderLink(message: string, name: string, phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const text = `¡Hola ${name.split(' ')[0]}! Te escribimos del estudio 🙂 ${message}. Cualquier cosa respondenos por acá.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

interface DashboardPageProps {
  onNavigate: (page: PageKey) => void
}

function OccupancyBar({ enrolled, capacity }: { enrolled: number; capacity: number }) {
  const pct = Math.round((enrolled / capacity) * 100)
  const color =
    pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-accent'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground shrink-0 w-12 text-right">
        {enrolled}/{capacity}
      </span>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  sinAcceso,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  sub: string
  accent: string
  /** El rol no tiene permiso: mejor decirlo que mostrar un cero que miente */
  sinAcceso?: boolean
}) {
  if (sinAcceso) {
    return (
      <div className="bg-card rounded-2xl border border-border border-dashed p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-medium">{label}</span>
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
        <div>
          <p className="text-base font-semibold text-muted-foreground leading-none">
            Sin acceso
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Tu rol no ve esta información
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${accent}18` }}
        >
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>
      </div>
    </div>
  )
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { canWrite, can } = useData()
  const { students, payments, alerts, monthlyRevenue, classes, denied } = useStudio()
  const sinFinanzas = denied.includes('payments')
  // Tomar asistencia desde "Clases de hoy": es el atajo que usa la
  // profesora cuando entra al sistema con la clase por empezar.
  const [asistenciaDe, setAsistenciaDe] = useState<(typeof classes)[number] | null>(null)
  const puedeMarcarAsistencia = can('reservas.asistencia') || canWrite

  const TODAY_CLASSES = classes
    .filter((c) => c.dayOfWeek === todayDayIndex())
    .sort((a, b) => a.time.localeCompare(b.time))
  const expiringStudents = students.filter((s) => s.membership?.status === 'por vencer')
  const pendingPayments = payments.filter((p) => p.status === 'pendiente' || p.status === 'vencido')
  const activeMembers = students.filter(
    (s) => s.membership?.status === 'activa' || s.membership?.status === 'por vencer'
  ).length
  const todayTotal = TODAY_CLASSES.reduce((acc, c) => acc + c.enrolled, 0)
  const currentMonth = monthlyRevenue[monthlyRevenue.length - 1]
  const prevMonth = monthlyRevenue[monthlyRevenue.length - 2] ?? currentMonth
  const currentMonthRevenue = currentMonth?.amount ?? 0
  const revenueDiff = prevMonth?.amount
    ? (((currentMonthRevenue - prevMonth.amount) / prevMonth.amount) * 100).toFixed(1)
    : '0.0'
  const maxRevenue = Math.max(1, ...monthlyRevenue.map((m) => m.amount))

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Alumnos activos"
          value={String(activeMembers)}
          sub={`${students.length} alumnos totales`}
          accent="#C4735A"
        />
        <StatCard
          icon={CalendarCheck}
          label="Clases hoy"
          value={String(TODAY_CLASSES.length)}
          sub={`${todayTotal} reservas confirmadas`}
          accent="#7D9B76"
        />
        {(canWrite || sinFinanzas) && (
          <StatCard
            icon={TrendingUp}
            label={sinFinanzas ? 'Ingresos del mes' : `Ingresos ${currentMonth?.month ?? ''}`}
            value={`$${(currentMonthRevenue / 1000).toFixed(0)}k`}
            sub={`${Number(revenueDiff) >= 0 ? '+' : ''}${revenueDiff}% vs ${prevMonth?.month ?? 'mes anterior'}`}
            accent="#D4A854"
            sinAcceso={sinFinanzas}
          />
        )}
        {(canWrite || sinFinanzas) && (
          <StatCard
            icon={AlertTriangle}
            label="Pagos pendientes"
            value={String(pendingPayments.length)}
            sub={`$${pendingPayments.reduce((a, p) => a + p.amount, 0).toLocaleString('es-AR')} total`}
            accent="#EF4444"
            sinAcceso={sinFinanzas}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's classes */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Clases de Hoy</h2>
            </div>
            <button
              onClick={() => onNavigate('agenda')}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              Ver agenda <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-border">
            {TODAY_CLASSES.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No hay clases programadas para hoy
              </div>
            )}
            {TODAY_CLASSES.map((cls) => {
              const isFull = cls.enrolled >= cls.capacity
              return (
                <div key={cls.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div
                    className="w-1.5 h-10 rounded-full shrink-0"
                    style={{ backgroundColor: cls.color }}
                  />
                  <div className="w-14 shrink-0">
                    <p className="text-sm font-semibold text-foreground">{cls.time}</p>
                    <p className="text-[11px] text-muted-foreground">{cls.durationMinutes}min</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cls.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {cls.teacherName} · {cls.room}
                    </p>
                  </div>
                  <div className="w-32 shrink-0">
                    <OccupancyBar enrolled={cls.enrolled} capacity={cls.capacity} />
                    {isFull && cls.waitlist > 0 && (
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        +{cls.waitlist} en espera
                      </p>
                    )}
                  </div>
                  {isFull && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive">
                      Llena
                    </span>
                  )}
                  {puedeMarcarAsistencia && cls.enrolled > 0 && (
                    <button
                      onClick={() => setAsistenciaDe(cls)}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-[11px] font-bold hover:bg-primary/5 transition-colors flex items-center gap-1.5"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      Asistencia
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Alerts */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <Flame className="w-4 h-4 text-destructive" />
              <h2 className="font-semibold text-foreground text-sm">Alertas</h2>
              <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                {alerts.length}
              </span>
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {alerts.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Sin alertas por ahora
                </div>
              )}
              {alerts.map((alert) => {
                const phone = alert.studentId
                  ? students.find((s) => s.id === alert.studentId)?.phone ?? ''
                  : ''
                const waLink = alert.studentName
                  ? alertReminderLink(alert.message, alert.studentName, phone)
                  : null
                return (
                  <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
                    <div
                      className={cn(
                        'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                        alert.type === 'danger' && 'bg-destructive',
                        alert.type === 'warning' && 'bg-amber-500',
                        alert.type === 'info' && 'bg-accent'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      {alert.studentName && (
                        <p className="text-xs font-semibold text-foreground truncate">
                          {alert.studentName}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground leading-snug">{alert.message}</p>
                    </div>
                    {canWrite && waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        title="Avisar por WhatsApp"
                        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-[#25D366]/15 hover:text-[#25D366] transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Expiring memberships */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground text-sm">Por vencer</h2>
              <button
                onClick={() => onNavigate('planes')}
                className="text-xs text-primary font-medium hover:underline"
              >
                Ver todas
              </button>
            </div>
            <div className="divide-y divide-border">
              {expiringStudents.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Ninguna membresía por vencer
                </div>
              )}
              {expiringStudents.map((student) => {
                const m = student.membership!
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <span className="text-amber-700 text-xs font-bold">{student.avatar}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {student.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{m.planName}</p>
                    </div>
                    <p className="text-[11px] font-semibold text-amber-600 shrink-0">
                      {m.endDate}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Revenue chart & pending payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue bar chart */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-foreground text-sm">Ingresos mensuales</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Últimos 6 meses</p>
            </div>
            <div className="flex items-center gap-1 text-accent text-xs font-semibold bg-accent/10 px-2.5 py-1 rounded-full">
              <ArrowUpRight className="w-3.5 h-3.5" />
              {Number(revenueDiff) >= 0 ? '+' : ''}{revenueDiff}%
            </div>
          </div>
          <div className="flex items-end gap-2 h-32">
            {monthlyRevenue.map((m, i) => {
              const isLast = i === monthlyRevenue.length - 1
              const height = (m.amount / maxRevenue) * 100
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                    <div
                      className={cn(
                        'w-full rounded-t-lg transition-all',
                        isLast ? 'bg-primary' : 'bg-muted'
                      )}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      isLast ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {m.month}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Total {currentMonth?.month ?? ''}</p>
            <p className="text-sm font-bold text-foreground">
              ${currentMonthRevenue.toLocaleString('es-AR')}
            </p>
          </div>
        </div>

        {/* Pending payments */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Pagos pendientes</h2>
            </div>
            <button
              onClick={() => onNavigate('pagos')}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              Ver todos <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-border overflow-y-auto max-h-56">
            {pendingPayments.map((p) => {
              const phone = students.find((s) => s.id === p.studentId)?.phone ?? ''
              const waLink = paymentReminderLink(p, phone)
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      p.status === 'vencido' ? 'bg-destructive' : 'bg-amber-500'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{p.studentName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.planName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-foreground">
                      ${p.amount.toLocaleString('es-AR')}
                    </p>
                    <p
                      className={cn(
                        'text-[10px] font-medium',
                        p.status === 'vencido' ? 'text-destructive' : 'text-amber-600'
                      )}
                    >
                      {p.status === 'vencido' ? 'Vencido' : `Vence ${p.dueDate}`}
                    </p>
                  </div>
                  {canWrite && waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noreferrer"
                      title="Enviar recordatorio por WhatsApp"
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-[#25D366]/15 hover:text-[#25D366] transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
          <div className="px-5 py-3 border-t border-border bg-muted/40">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total adeudado</span>
              <span className="text-sm font-bold text-destructive">
                ${pendingPayments.reduce((a, p) => a + p.amount, 0).toLocaleString('es-AR')}
              </span>
            </div>
          </div>
        </div>
      </div>
      {asistenciaDe && (
        <TomarAsistencia
          classId={asistenciaDe.id}
          date={localISO()}
          title={asistenciaDe.title}
          time={asistenciaDe.time}
          onClose={() => setAsistenciaDe(null)}
        />
      )}
    </div>
  )
}
