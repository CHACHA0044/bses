'use client';

import React from 'react';
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FileCheck,
  FilePlus,
  FileWarning,
  FileX,
  FolderOpen,
  Send,
  SearchCheck,
  StickyNote,
  Upload,
  UserCheck,
  UserCog,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { TimelineEvent, WorkflowActionType } from '@/types/workflow';
import { cn } from '@/lib/utils';

interface ActionStyle {
  icon: LucideIcon;
  iconWrap: string;
  dot: string;
}

export const ACTION_STYLES: Record<WorkflowActionType | string, ActionStyle> = {
  APPLICATION_CREATED: { icon: FilePlus, iconWrap: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  DOCUMENT_UPLOADED: { icon: Upload, iconWrap: 'bg-indigo-50 text-indigo-600', dot: 'bg-indigo-500' },
  SUBMIT: { icon: Send, iconWrap: 'bg-blue-50 text-blue-600', dot: 'bg-blue-500' },
  ASSIGN: { icon: UserCheck, iconWrap: 'bg-violet-50 text-violet-600', dot: 'bg-violet-500' },
  REASSIGN: { icon: UserCog, iconWrap: 'bg-violet-50 text-violet-600', dot: 'bg-violet-500' },
  START_VERIFICATION: { icon: SearchCheck, iconWrap: 'bg-cyan-50 text-cyan-600', dot: 'bg-cyan-500' },
  REQUEST_DOCUMENTS: { icon: FileWarning, iconWrap: 'bg-orange-50 text-orange-600', dot: 'bg-orange-500' },
  COMPLETE_VERIFICATION: { icon: BadgeCheck, iconWrap: 'bg-teal-50 text-teal-600', dot: 'bg-teal-500' },
  APPROVE: { icon: CheckCircle2, iconWrap: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
  REJECT: { icon: XCircle, iconWrap: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
  SCHEDULE_CONNECTION: { icon: CalendarClock, iconWrap: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500' },
  COMPLETE_CONNECTION: { icon: Zap, iconWrap: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
  ADD_REMARK: { icon: StickyNote, iconWrap: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  DOCUMENT_APPROVE: { icon: FileCheck, iconWrap: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
  DOCUMENT_REJECT: { icon: FileX, iconWrap: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
  DOCUMENT_REQUEST: { icon: FileWarning, iconWrap: 'bg-orange-50 text-orange-600', dot: 'bg-orange-500' },
};

const DEFAULT_STYLE: ActionStyle = { icon: FolderOpen, iconWrap: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

export interface ApplicationTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

/**
 * Vertical activity timeline for a connection application. Renders every
 * workflow event (submit, assign, verify, approve, schedule, remarks...) with
 * an action-specific icon and color. Ordered oldest → newest by the API.
 */
export const ApplicationTimeline: React.FC<ApplicationTimelineProps> = ({ events, className = '' }) => {
  if (events.length === 0) {
    return (
      <div className={cn('bg-slate-50 rounded-xl p-6 text-center', className)}>
        <p className="text-xs font-semibold text-slate-500">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <ol className={cn('relative space-y-4', className)}>
      {events.map((event, idx) => {
        const style = ACTION_STYLES[event.action] ?? DEFAULT_STYLE;
        const Icon = style.icon;
        const isLast = idx === events.length - 1;

        return (
          <li key={event.id} className="relative flex gap-4">
            {/* Connecting line */}
            {!isLast && (
              <span className="absolute left-[15px] top-9 bottom-[-16px] w-px bg-slate-200" aria-hidden="true" />
            )}

            {/* Icon node */}
            <div
              className={cn(
                'relative z-10 h-8 w-8 shrink-0 rounded-full flex items-center justify-center border border-white shadow-sm',
                style.iconWrap,
              )}
            >
              <Icon className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{event.label ?? event.action.replaceAll('_', ' ')}</span>
                <span className="text-[11px] font-semibold text-slate-400">{formatDateTime(event.createdAt)}</span>
              </div>

              {event.notes && <p className="mt-1 text-xs text-slate-600">{event.notes}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
                  {event.status}
                </span>
                {event.performedBy && (
                  <span className="text-[11px] text-slate-400">
                    by <span className="font-semibold text-slate-600">{event.performedBy}</span>
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
