'use client';

import { useState } from 'react';
import { MOCK_TODAY } from './mock-data';
import type { DayRange } from './period';
import { useToday } from './use-today';

/**
 * The date filter state used by the dashboard and accounting. Defaults to today.
 * Until the real date is known (first render) it falls back to the demo date so server and
 * client markup match; a range the user never touched follows today automatically.
 */
export function useDayRange(): {
  today: string;
  range: DayRange;
  setRange: (range: DayRange) => void;
} {
  const realToday = useToday();
  const today = realToday || MOCK_TODAY;
  const [custom, setCustom] = useState<DayRange | null>(null);
  return { today, range: custom ?? { start: today, end: today }, setRange: setCustom };
}
