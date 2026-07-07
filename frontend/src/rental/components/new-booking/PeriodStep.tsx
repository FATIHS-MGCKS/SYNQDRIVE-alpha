import { SectionHeader } from '../../../components/patterns';
import { StationSelectFields } from '../stations/StationSelectFields';
import { Icon } from '../ui/Icon';
import { BookingStepCard } from './BookingStepCard';
import type { PeriodBlockedDayInfo, PeriodStepProps } from './types';

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function getCalendarDays(month: number, year: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;
  const days: (number | null)[] = [];
  for (let i = 0; i < adjustedFirst; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

function calendarDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isInRange(
  day: number,
  pickupDate: string,
  returnDate: string,
  year: number,
  month: number,
) {
  if (!pickupDate || !returnDate || !day) return false;
  const dateStr = calendarDateStr(year, month, day);
  return dateStr >= pickupDate && dateStr <= returnDate;
}

function isStartDay(day: number, pickupDate: string, year: number, month: number) {
  if (!pickupDate || !day) return false;
  return calendarDateStr(year, month, day) === pickupDate;
}

function isEndDay(day: number, returnDate: string, year: number, month: number) {
  if (!returnDate || !day) return false;
  return calendarDateStr(year, month, day) === returnDate;
}

function AnalogClock({
  time,
  handColor,
}: {
  time: string;
  handColor: string;
}) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="56" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i * 30 - 90) * (Math.PI / 180);
        const x1 = 60 + 44 * Math.cos(angle);
        const y1 = 60 + 44 * Math.sin(angle);
        const x2 = 60 + 50 * Math.cos(angle);
        const y2 = 60 + 50 * Math.sin(angle);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--muted-foreground)"
            strokeWidth={i % 3 === 0 ? 2.5 : 1.5}
            strokeLinecap="round"
          />
        );
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const num = i === 0 ? 12 : i;
        const angle = (i * 30 - 90) * (Math.PI / 180);
        const x = 60 + 36 * Math.cos(angle);
        const y = 60 + 36 * Math.sin(angle);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--muted-foreground)"
            fontSize="9"
            fontWeight="500"
          >
            {num}
          </text>
        );
      })}
      {(() => {
        const [h, m] = time.split(':').map(Number);
        const hourAngle = ((h % 12) * 30 + m * 0.5 - 90) * (Math.PI / 180);
        return (
          <line
            x1="60"
            y1="60"
            x2={60 + 26 * Math.cos(hourAngle)}
            y2={60 + 26 * Math.sin(hourAngle)}
            stroke={handColor}
            strokeWidth="3"
            strokeLinecap="round"
          />
        );
      })()}
      {(() => {
        const [, m] = time.split(':').map(Number);
        const minAngle = (m * 6 - 90) * (Math.PI / 180);
        return (
          <line
            x1="60"
            y1="60"
            x2={60 + 38 * Math.cos(minAngle)}
            y2={60 + 38 * Math.sin(minAngle)}
            stroke={handColor}
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })()}
      <circle cx="60" cy="60" r="3" fill={handColor} />
    </svg>
  );
}

export function PeriodStep({
  pickupDate,
  returnDate,
  pickupTime,
  returnTime,
  showPickupTimePicker,
  showReturnTimePicker,
  pickupStationId,
  returnStationId,
  sameReturnStation,
  orgStations,
  calendarMonth,
  calendarYear,
  calendarSelectMode,
  selectedVehicle,
  blockedDays,
  vehicleBlockedInfo,
  hoveredDay,
  rangeHasConflict,
  onPickupDateChange,
  onReturnDateChange,
  onPickupTimeChange,
  onReturnTimeChange,
  onShowPickupTimePickerChange,
  onShowReturnTimePickerChange,
  onPickupStationChange,
  onReturnStationChange,
  onSameReturnStationChange,
  onCalendarMonthChange,
  onCalendarYearChange,
  onCalendarSelectModeChange,
  onHoveredDayChange,
  onCalendarDayClick,
}: PeriodStepProps) {
  const todayMin = new Date().toISOString().slice(0, 10);

  return (
    <BookingStepCard>
      <div className="p-4">
        <SectionHeader title="Zeitraum & Abholung" className="mb-3" />

        <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs text-muted-foreground">Abholung</label>
            <div className="flex min-w-0 gap-2">
              <input
                type="date"
                value={pickupDate}
                min={todayMin}
                onChange={(e) => {
                  const val = e.target.value;
                  onPickupDateChange(val);
                  if (val) {
                    const d = new Date(val);
                    onCalendarMonthChange(d.getMonth());
                    onCalendarYearChange(d.getFullYear());
                    if (returnDate && val >= returnDate) {
                      onReturnDateChange('');
                    }
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-foreground outline-none"
              />
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onShowPickupTimePickerChange(!showPickupTimePicker);
                    onShowReturnTimePickerChange(false);
                  }}
                  className={`flex min-w-[5.25rem] items-center gap-1.5 rounded-lg border px-2.5 py-2.5 text-xs outline-none transition-all sm:min-w-[7rem] sm:gap-2 sm:px-3 ${
                    showPickupTimePicker
                      ? 'sq-tone-brand border border-border'
                      : 'border-border bg-card text-foreground hover:border-border'
                  }`}
                >
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  {pickupTime}
                </button>
                {showPickupTimePicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => onShowPickupTimePickerChange(false)} />
                    <div className="absolute left-1/2 top-full z-50 mt-2 w-52 -translate-x-1/2 rounded-lg border border-border bg-card/95 p-4 shadow-2xl">
                      <div className="mb-3 flex justify-center">
                        <AnalogClock time={pickupTime} handColor="var(--status-info)" />
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Icon name="clock" className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="time"
                          value={pickupTime}
                          onChange={(e) => onPickupTimeChange(e.target.value)}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-center text-xs text-foreground outline-none transition-colors focus:border-[color:var(--brand)]"
                        />
                      </div>
                      <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-border bg-card/95" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <label className="mb-1.5 block text-xs text-muted-foreground">Rückgabe</label>
            <div className="flex min-w-0 gap-2">
              <input
                type="date"
                value={returnDate}
                min={pickupDate || todayMin}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && pickupDate && val <= pickupDate) return;
                  onReturnDateChange(val);
                  if (val) {
                    const d = new Date(val);
                    onCalendarMonthChange(d.getMonth());
                    onCalendarYearChange(d.getFullYear());
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-foreground outline-none"
              />
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onShowReturnTimePickerChange(!showReturnTimePicker);
                    onShowPickupTimePickerChange(false);
                  }}
                  className={`flex min-w-[5.25rem] items-center gap-1.5 rounded-lg border px-2.5 py-2.5 text-xs outline-none transition-all sm:min-w-[7rem] sm:gap-2 sm:px-3 ${
                    showReturnTimePicker
                      ? 'sq-tone-success border border-border'
                      : 'border-border bg-card text-foreground hover:border-border'
                  }`}
                >
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  {returnTime}
                </button>
                {showReturnTimePicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => onShowReturnTimePickerChange(false)} />
                    <div className="absolute left-1/2 top-full z-50 mt-2 w-52 -translate-x-1/2 rounded-lg border border-border bg-card/95 p-4 shadow-2xl">
                      <div className="mb-3 flex justify-center">
                        <AnalogClock time={returnTime} handColor="var(--status-positive)" />
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Icon name="clock" className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="time"
                          value={returnTime}
                          onChange={(e) => onReturnTimeChange(e.target.value)}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-center text-xs text-foreground outline-none transition-colors focus:border-[color:var(--status-positive)]"
                        />
                      </div>
                      <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-border bg-card/95" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <StationSelectFields
            stations={orgStations}
            pickupStationId={pickupStationId}
            returnStationId={returnStationId}
            sameReturnStation={sameReturnStation}
            onPickupChange={(id) => {
              onPickupStationChange(id);
              if (sameReturnStation) onReturnStationChange(id);
            }}
            onReturnChange={onReturnStationChange}
            onSameReturnChange={onSameReturnStationChange}
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCalendarSelectModeChange('pickup')}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-xs transition-all ${
                calendarSelectMode === 'pickup'
                  ? 'sq-tone-brand border border-border'
                  : 'border border-border bg-card text-muted-foreground'
              }`}
            >
              <Icon name="calendar" className="mx-auto mb-1 h-3.5 w-3.5" />
              Abholdatum wählen
            </button>
            <button
              type="button"
              onClick={() => onCalendarSelectModeChange('return')}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-xs transition-all ${
                calendarSelectMode === 'return'
                  ? 'sq-tone-success border border-border'
                  : 'border border-border bg-card text-muted-foreground'
              }`}
            >
              <Icon name="calendar" className="mx-auto mb-1 h-3.5 w-3.5" />
              Rückgabedatum wählen
            </button>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (calendarMonth === 0) {
                  onCalendarMonthChange(11);
                  onCalendarYearChange(calendarYear - 1);
                } else {
                  onCalendarMonthChange(calendarMonth - 1);
                }
              }}
              className="rounded-lg p-1 transition-colors hover:bg-muted"
            >
              <Icon name="chevron-left" className="h-5 w-5" />
            </button>
            <span className="text-xs text-foreground">
              {MONTH_NAMES[calendarMonth]} {calendarYear}
            </span>
            <button
              type="button"
              onClick={() => {
                if (calendarMonth === 11) {
                  onCalendarMonthChange(0);
                  onCalendarYearChange(calendarYear + 1);
                } else {
                  onCalendarMonthChange(calendarMonth + 1);
                }
              }}
              className="rounded-lg p-1 transition-colors hover:bg-muted"
            >
              <Icon name="chevron-right" className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
              <div key={d} className="py-1 text-xs text-muted-foreground">
                {d}
              </div>
            ))}
            {getCalendarDays(calendarMonth, calendarYear).map((day, i) => {
              const isBlocked = day ? blockedDays.includes(day) : false;
              const blockInfo: PeriodBlockedDayInfo | null = day ? vehicleBlockedInfo[day] ?? null : null;
              return (
                <div key={i} className="relative">
                  <button
                    type="button"
                    disabled={!day || isBlocked}
                    onClick={() => day && onCalendarDayClick(day)}
                    onMouseEnter={() => {
                      if (day && isBlocked) onHoveredDayChange(day);
                    }}
                    onMouseLeave={() => onHoveredDayChange(null)}
                    className={`w-full rounded-lg py-2 text-xs transition-all ${
                      !day
                        ? 'cursor-default'
                        : isBlocked
                          ? `cursor-not-allowed ${
                              blockInfo?.reason === 'maintenance' ? 'sq-tone-watch' : 'sq-tone-critical'
                            }`
                          : isStartDay(day, pickupDate, calendarYear, calendarMonth)
                            ? 'cursor-pointer bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover'
                            : isEndDay(day, returnDate, calendarYear, calendarMonth)
                              ? 'cursor-pointer bg-green-600 text-white shadow-sm hover:bg-green-700'
                              : isInRange(day, pickupDate, returnDate, calendarYear, calendarMonth)
                                ? 'cursor-pointer sq-tone-brand hover:opacity-90'
                                : 'cursor-pointer text-foreground hover:bg-muted'
                    }`}
                  >
                    {day || ''}
                  </button>
                  {hoveredDay === day && day && blockInfo && (
                    <div className="absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2 rounded-lg border border-border bg-card/95 p-2.5 text-foreground shadow-lg">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        {blockInfo.reason === 'maintenance' ? (
                          <Icon name="wrench" className="h-3 w-3 text-[color:var(--status-watch)]" />
                        ) : (
                          <Icon name="car" className="h-3 w-3 text-[color:var(--status-critical)]" />
                        )}
                        <span
                          className={`text-xs ${
                            blockInfo.reason === 'maintenance'
                              ? 'text-[color:var(--status-watch)]'
                              : 'text-[color:var(--status-critical)]'
                          }`}
                        >
                          {blockInfo.reason === 'maintenance' ? 'Wartung' : 'Vermietet'}
                        </span>
                      </div>
                      <div className="mb-1 text-xs text-foreground">
                        <span className="flex items-center gap-1">
                          <Icon name="calendar" className="h-3 w-3" />
                          {blockInfo.startDay}. – {blockInfo.endDay}. {MONTH_NAMES[calendarMonth]}
                        </span>
                      </div>
                      {blockInfo.reason !== 'maintenance' && (
                        <div className="text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Icon name="user" className="h-3 w-3" />
                            {blockInfo.customer}
                          </span>
                        </div>
                      )}
                      <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-border bg-card/95" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/30 pt-3">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-brand" />
              <span className="text-xs text-muted-foreground">Abholung</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-green-600" />
              <span className="text-xs text-muted-foreground">Rückgabe</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded sq-tone-brand" />
              <span className="text-xs text-muted-foreground">Zeitraum</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded sq-tone-critical" />
              <span className="text-xs text-muted-foreground">Gebucht</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded sq-tone-watch" />
              <span className="text-xs text-muted-foreground">Wartung</span>
            </div>
          </div>

          {!selectedVehicle && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 sq-tone-info">
              <Icon name="alert-circle" className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-info)]" />
              <span className="text-xs text-[color:var(--status-info)]">
                Bitte wählen Sie zuerst ein Fahrzeug, um die Verfügbarkeit zu sehen.
              </span>
            </div>
          )}
          {rangeHasConflict && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 sq-tone-critical">
              <Icon name="alert-circle" className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-critical)]" />
              <span className="text-xs text-[color:var(--status-critical)]">
                Der gewählte Zeitraum überschneidet sich mit einer bestehenden Reservierung oder Wartung. Bitte wählen Sie einen anderen Zeitraum.
              </span>
            </div>
          )}
        </div>
      </div>
    </BookingStepCard>
  );
}
