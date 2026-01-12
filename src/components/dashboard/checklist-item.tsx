
'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ChecklistItemProps {
  title: string;
  description: string;
  isCompleted: boolean;
  href: string;
  ctaText: string;
}

export function ChecklistItem({ title, description, isCompleted, href, ctaText }: ChecklistItemProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-lg border transition-colors',
        isCompleted ? 'bg-muted/50 border-dashed' : 'bg-background'
      )}
    >
      <div className="flex-shrink-0">
        {isCompleted ? (
          <CheckCircle2 className="h-6 w-6 text-green-500" />
        ) : (
          <Circle className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex-grow">
        <h3 className={cn('font-semibold', isCompleted && 'text-muted-foreground line-through')}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex-shrink-0">
        <Button asChild variant={isCompleted ? 'ghost' : 'secondary'} size="sm" disabled={isCompleted}>
          <Link href={href}>
            {isCompleted ? 'Completado' : ctaText}
            {!isCompleted && <ArrowRight className="ml-2 h-4 w-4" />}
          </Link>
        </Button>
      </div>
    </div>
  );
}
