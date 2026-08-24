'use client'

import { useState } from 'react'
import { Search, Plus, Filter, ChevronRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import type { Student } from '@/lib/types'
import { FichaAlumno } from './ficha-alumno'
import { AlumnoFormModal } from './alumno-form-modal'

const STATUS_CONFIG = {
  activa: { label: 'Activa', class: 'bg-[#E8F2EB] text-[#2E6040]' },
  'por vencer': { label: 'Por vencer', class: 'bg-amber-100 text-amber-700' },
  vencida: { label: 'Vencida', class: 'bg-red-100 text-red-700' },
  suspendida: { label: 'Suspendida', class: 'bg-gray-100 text-gray-600' },
  sin_membresia: { label: 'Sin membresía', class: 'bg-gray-100 text-gray-500' },
}

function StudentCard({ student, onClick }: { student: Student; onClick: () => void }) {
  const ms = student.membership
  const statusKey = ms?.status ?? 'sin_membresia'
  const statusCfg = STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.sin_membresia
  const classesLeft = ms ? ms.classesTotal - ms.classesUsed : 0
  const hasMedical = !!student.medicalNotes

  return (
    <button
      onClick={onClick}
      className="bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/40 hover:shadow-md transition-all group w-full"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-primary font-bold text-sm">{student.avatar}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">{student.name}</p>
            {hasMedical && (
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Tiene notas médicas" />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{student.email}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </div>

      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', statusCfg.class)}>
          {statusCfg.label}
        </span>
        {ms && (
          <span className="text-[10px] text-muted-foreground">
            {classesLeft} clase{classesLeft !== 1 ? 's' : ''} restante{classesLeft !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {ms && (
        <>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.round((ms.classesUsed / ms.classesTotal) * 100)}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">{ms.planName}</p>
            <p className="text-[11px] text-muted-foreground">
              {ms.classesUsed}/{ms.classesTotal}
            </p>
          </div>
        </>
      )}
    </button>
  )
}

export function AlumnosPage() {
  const { canWrite } = useData()
  const { students: STUDENTS, reservations: RESERVATIONS, payments: PAYMENTS } = useStudio()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('todos')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNewStudent, setShowNewStudent] = useState(false)

  const selectedStudent = selectedId ? STUDENTS.find((s) => s.id === selectedId) ?? null : null

  const filtered = STUDENTS.filter((s) => {
    const matchSearch =
      search === '' ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())

    const matchStatus =
      filterStatus === 'todos' ||
      (filterStatus === 'activa' && s.membership?.status === 'activa') ||
      (filterStatus === 'por vencer' && s.membership?.status === 'por vencer') ||
      (filterStatus === 'vencida' && s.membership?.status === 'vencida') ||
      (filterStatus === 'sin_membresia' && !s.membership)

    return matchSearch && matchStatus
  })

  if (selectedStudent) {
    const studentReservations = RESERVATIONS.filter((r) => r.studentId === selectedStudent.id)
    const studentPayments = PAYMENTS.filter((p) => p.studentId === selectedStudent.id)
    return (
      <FichaAlumno
        student={selectedStudent}
        reservations={studentReservations}
        payments={studentPayments}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm flex-1 min-w-48 max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar alumno..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          {(['todos', 'activa', 'por vencer', 'vencida', 'sin_membresia'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                filterStatus === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
              )}
            >
              {s === 'todos'
                ? 'Todos'
                : s === 'sin_membresia'
                ? 'Sin membresía'
                : s === 'por vencer'
                ? 'Por vencer'
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {canWrite && (
          <button
            onClick={() => setShowNewStudent(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo alumno</span>
          </button>
        )}
      </div>

      {/* Count */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-border">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{filtered.length}</strong> alumno
          {filtered.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-[#2E6040]">
              {STUDENTS.filter((s) => s.membership?.status === 'activa').length}
            </strong>{' '}
            activos
          </span>
          <span>
            <strong className="text-amber-600">
              {STUDENTS.filter((s) => s.membership?.status === 'por vencer').length}
            </strong>{' '}
            por vencer
          </span>
          <span>
            <strong className="text-destructive">
              {STUDENTS.filter((s) => s.membership?.status === 'vencida').length}
            </strong>{' '}
            vencidos
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Search className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No se encontraron alumnos</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                onClick={() => setSelectedId(student.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showNewStudent && <AlumnoFormModal onClose={() => setShowNewStudent(false)} />}
    </div>
  )
}
