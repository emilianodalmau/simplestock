'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChecklistItem } from './checklist-item';
import { PartyPopper } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  description: string;
  isCompleted: boolean;
  href: string;
  ctaText: string;
}

interface OnboardingChecklistProps {
  steps: Step[];
}

export function OnboardingChecklist({ steps }: OnboardingChecklistProps) {
  const completedCount = steps.filter(step => step.isCompleted).length;
  const progressPercentage = (completedCount / steps.length) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guía de Inicio Rápido</CardTitle>
        <CardDescription>
          Completa estos pasos para configurar tu espacio de trabajo y empezar a gestionar tu inventario.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-medium text-muted-foreground">Progreso</p>
            <p className="text-sm font-bold">{completedCount} de {steps.length} completados</p>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
        <div className="space-y-4">
          {steps.map(step => (
            <ChecklistItem
              key={step.id}
              title={step.title}
              description={step.description}
              isCompleted={step.isCompleted}
              href={step.href}
              ctaText={step.ctaText}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
