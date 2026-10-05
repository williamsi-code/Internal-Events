import { query, one } from './db';

/**
 * The catering day.
 *
 * Tasks against stations and time, with the service work that
 * happens away from the kitchen alongside it. Every row carries its
 * event, because the first thing anyone asks looking at a task is
 * "which event is that for".
 */

export interface ProductionTask {
  id: string;
  request_id: string | null;
  reference_code: string | null;
  event_name: string | null;
  customer_name: string | null;
  title: string;
  quantity: string | null;
  unit: string | null;
  note: string | null;
  state: string;
  station_name: string | null;
  station_id: string | null;
  station_order: number | null;
  start_minutes: number;
  end_minutes: number;
  assigned_to_name: string | null;
  assigned_to: string | null;
  space_name: string | null;
  no_recipe: boolean;
}

export async function getProductionDay(day: string) {
  return query<ProductionTask>(
    `SELECT id, request_id, reference_code, event_name, customer_name,
            title, quantity::text, unit, note, state,
            station_name, station_id, station_order,
            start_minutes, end_minutes,
            assigned_to_name, assigned_to, space_name, no_recipe
       FROM production_day
      WHERE day = $1::date
      ORDER BY station_order NULLS LAST, start_minutes`,
    [day]
  );
}

export interface ServiceWindow {
  id: string;
  request_id: string;
  reference_code: string;
  event_name: string;
  customer_name: string | null;
  kind: string;
  start_minutes: number;
  end_minutes: number;
  staff_count: number;
  note: string | null;
  space_name: string | null;
  building: string | null;
  attendance: number | null;
  room_conflict: boolean;
}

export async function getServiceDay(day: string) {
  return query<ServiceWindow>(
    `SELECT id, request_id, reference_code, event_name, customer_name,
            kind, start_minutes, end_minutes, staff_count, note,
            space_name, building, attendance, room_conflict
       FROM service_day
      WHERE day = $1::date
      ORDER BY start_minutes`,
    [day]
  );
}

export interface Station {
  id: string;
  name: string;
  capacity: number;
  sort_order: number;
}

export async function listStations() {
  return query<Station>(
    `SELECT id, name, capacity, sort_order
       FROM kitchen_stations WHERE is_active ORDER BY sort_order`
  );
}

/** How busy each day is, for the month strip above the grid. */
export async function getLoadRange(from: string, to: string) {
  return query<{
    day: string;
    events: number;
    tasks: number;
    task_hours: string;
    service_hours: string;
    total_hours: string;
  }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            events, tasks,
            round(task_hours, 1)::text AS task_hours,
            round(service_hours, 1)::text AS service_hours,
            round(total_hours, 1)::text AS total_hours
       FROM kitchen_load
      WHERE day BETWEEN $1::date AND $2::date
      ORDER BY day`,
    [from, to]
  );
}

export async function getUnplanned() {
  return query<{
    id: string;
    reference_code: string;
    event_name: string;
    event_date: string;
    start_time: string | null;
    attendance: number;
    space_name: string | null;
    menu_lines: number;
  }>(
    `SELECT id, reference_code, event_name,
            to_char(event_date, 'YYYY-MM-DD') AS event_date,
            start_time, attendance, space_name, menu_lines
       FROM unplanned_events
      LIMIT 30`
  );
}

export async function getRoomConflicts(day: string) {
  return query<{
    window_id: string;
    request_id: string;
    reference_code: string;
    event_name: string;
    kind: string;
    space_name: string;
    problem: string;
  }>(
    `SELECT window_id, request_id, reference_code, event_name,
            kind, space_name, problem
       FROM service_room_conflicts
      WHERE (starts_at AT TIME ZONE 'America/Chicago')::date = $1::date`,
    [day]
  );
}

export async function getDaySummary(day: string) {
  return one<{
    events: number;
    tasks: number;
    done: number;
    task_hours: string;
    service_hours: string;
    conflicts: number;
  }>(
    `SELECT
       coalesce(l.events, 0)::int AS events,
       coalesce(l.tasks, 0)::int AS tasks,
       coalesce(l.tasks_done, 0)::int AS done,
       round(coalesce(l.task_hours, 0), 1)::text AS task_hours,
       round(coalesce(l.service_hours, 0), 1)::text AS service_hours,
       (SELECT count(*)::int FROM service_room_conflicts src
         WHERE (src.starts_at AT TIME ZONE 'America/Chicago')::date = $1::date)
         AS conflicts
       FROM kitchen_load l
      WHERE l.day = $1::date`,
    [day]
  );
}


/* ============================================================
   The catering calendar
   
   The same shape as the room scheduler, filtered to events with
   food. A different question from the prep grid: this one answers
   "what are we catering on Thursday", not "what is in which oven".
   ============================================================ */

export interface CateredBooking {
  id: string;
  request_id: string;
  reference_code: string;
  title: string;
  event_name: string;
  customer_name: string | null;
  space_id: string;
  space_name: string;
  building: string | null;
  status: string;
  classification: string | null;
  attendance: number | null;
  food_kinds: string | null;
  central_cooking: boolean;
  menu_lines: number;
  tasks: number;
  tasks_done: number;
  event_date: string;
  start_minutes: number;
  end_minutes: number;
  hold_start_minutes: number;
  hold_end_minutes: number;
}

export async function getCateredBookings(from: string, to: string) {
  return query<CateredBooking>(
    `SELECT id, request_id, reference_code, title, event_name,
            customer_name, space_id, space_name, building,
            status, classification, attendance, food_kinds,
            central_cooking, menu_lines, tasks, tasks_done,
            to_char(event_date, 'YYYY-MM-DD') AS event_date,
            (extract(hour from event_starts_at AT TIME ZONE 'America/Chicago') * 60
             + extract(minute from event_starts_at AT TIME ZONE 'America/Chicago'))::int
              AS start_minutes,
            (extract(hour from event_ends_at AT TIME ZONE 'America/Chicago') * 60
             + extract(minute from event_ends_at AT TIME ZONE 'America/Chicago'))::int
              AS end_minutes,
            (extract(hour from starts_at AT TIME ZONE 'America/Chicago') * 60
             + extract(minute from starts_at AT TIME ZONE 'America/Chicago'))::int
              AS hold_start_minutes,
            (extract(hour from ends_at AT TIME ZONE 'America/Chicago') * 60
             + extract(minute from ends_at AT TIME ZONE 'America/Chicago'))::int
              AS hold_end_minutes
       FROM catered_bookings
      WHERE event_date BETWEEN $1::date AND $2::date
      ORDER BY event_starts_at`,
    [from, to]
  );
}

export async function getCateredSpaces(from: string, to: string) {
  return query<{
    id: string;
    name: string;
    building: string | null;
    category: string | null;
    capacity_seated: number | null;
    events: number;
  }>('SELECT * FROM catered_spaces_between($1::date, $2::date)', [from, to]);
}
