'use client';

import { usePhones } from '@/hooks/use-workflow';
import { PhoneCard } from './phone-card';

export function PhoneGrid() {
  const phones = usePhones();

  if (phones.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No phones loaded. Start a workflow to see phone status.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {phones.map((phone) => (
        <PhoneCard key={phone.envId} phone={phone} />
      ))}
    </div>
  );
}
