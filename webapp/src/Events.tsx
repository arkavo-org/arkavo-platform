// src/Events.tsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./css/Events.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { EventApi, EventContentArg, EventClickArg } from "@fullcalendar/core";

const toISO = (v: string | Date | undefined | null) => {
  if (!v) return undefined;
  const d = typeof v === "string" ? new Date(v) : v;
  const t = d?.getTime?.();
  return Number.isFinite(t) ? new Date(t!).toISOString() : undefined;
};

const toAbsolute = (maybePath?: string) => {
  if (!maybePath) return undefined;
  if (/^https?:\/\//i.test(maybePath)) return maybePath;
  try {
    return new URL(maybePath, "https://codecollective.us").toString();
  } catch {
    return maybePath;
  }
};

// local Y-M-D helper (avoids UTC shifting)
const ymdLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const Events: React.FC = (): JSX.Element => {
  const [rawEvents, setRawEvents] = useState<any[]>([]);
  const [search, setSearch] = useState({ category: "", keyword: "" });
  const [selectedEvent, setSelectedEvent] = useState<EventApi | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get("https://codecollective.us/upcoming_events.json");
        setRawEvents(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        console.error("Error fetching events:", e);
      }
    })();
  }, []);

  const { normalized } = useMemo(() => {
    const ok: any[] = [];
    rawEvents.forEach((ev, idx) => {
      const title = ev.name || ev.title || "(Untitled)";
      const start = toISO(ev.startDate) || toISO(ev.date) || toISO(ev.start) || undefined;
      const end = toISO(ev.endTime) || toISO(ev.endDate) || toISO(ev.end) || undefined;
      if (!start) return;
      ok.push({
        id: ev.id ?? `${idx}-${title}`,
        title,
        start,
        end,
        description: ev.description || ev.details || "",
        location: ev.location?.name || ev.venue || "",
        url: ev.url || "",
        imageUrl: toAbsolute(ev.imageUrl),
        _raw: ev,
      });
    });
    return { normalized: ok };
  }, [rawEvents]);

  const filtered = useMemo(() => {
    const cat = search.category.trim().toLowerCase();
    const key = search.keyword.trim().toLowerCase();
    return normalized.filter((e) => {
      const hayCat = (
        e._raw?.category ||
        e._raw?.tags ||
        e.description ||
        e.title ||
        ""
      )
        .toString()
        .toLowerCase();
      const hayKey = (e.title || "").toLowerCase();
      const catMatch = cat ? hayCat.includes(cat) : true;
      const keyMatch = key ? hayKey.includes(key) : true;
      return catMatch && keyMatch;
    });
  }, [normalized, search]);

  // Build a date -> random image map for day backgrounds
  const dayImages = useMemo(() => {
    const groups = new Map<string, string[]>();
    filtered.forEach((e) => {
      if (!e.imageUrl) return;
      const d = ymdLocal(new Date(e.start));
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(e.imageUrl);
    });
    const pick: Record<string, string> = {};
    groups.forEach((arr, d) => {
      pick[d] = arr[Math.floor(Math.random() * arr.length)];
    });
    return pick;
  }, [filtered]);

  const renderEventContent = (arg: EventContentArg) => (
    <div className="event-content">
      <b>{arg.event.title}</b>
    </div>
  );

  const handleEventClick = (arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    arg.jsEvent.stopPropagation();
    setSelectedEvent(arg.event);
  };

  const closeModal = () => setSelectedEvent(null);

  const formatDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

  return (
    <div className="events-page">
      <style>{`
        .event-content{padding:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .event-content b{font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,.6);}

        /* Improve legibility of day numbers over images */
        .fc .fc-daygrid-day-number{
          color: #fff;
          text-shadow: 0 1px 2px rgba(0,0,0,.7);
          position: relative;
          z-index: 2;
        }
        /* Dark overlay so text stays readable on bg images */
        .fc-daygrid-day{
          background-color:#f8f8f8;
          background-position:center;
          background-size:cover;
          background-repeat:no-repeat;
        }
        .fc-daygrid-day::before{
          content:"";
          position:absolute; inset:0;
          background:linear-gradient(to bottom, rgba(0,0,0,.25), rgba(0,0,0,.25));
          z-index:1;
          pointer-events:none;
        }
        .fc-daygrid-day-frame{ position: relative; z-index: 2; }

        /* Modal: small, centered, scrollable body */
        .modal-backdrop{
          position:fixed; inset:0;
          background:rgba(0,0,0,0.45);
          display:flex; align-items:center; justify-content:center;
          z-index:1000; padding:16px;
        }
        .modal-card{
          width:100%; max-width:520px; max-height:90vh;
          background:#fff; color:#111;
          border-radius:16px;
          box-shadow:0 10px 30px rgba(0,0,0,0.25);
          overflow:hidden;
          transform:translateY(0);
          animation:modalIn .15s ease-out;
          display:flex; flex-direction:column;
        }
        @keyframes modalIn { from { transform:translateY(8px); opacity:0 } to { transform:translateY(0); opacity:1 } }
        .modal-media{
          width:100%;
          height:200px; /* smaller banner to keep modal compact */
          background:#f3f3f3;
          display:block; object-fit:cover; flex:0 0 auto;
        }
        .modal-body{ padding:16px 18px; overflow:auto; flex:1 1 auto; overscroll-behavior:contain; }
        .modal-title{ margin:0 0 8px 0; font-size:1.15rem; line-height:1.3; font-weight:700; }
        .modal-meta{ font-size:0.9rem; opacity:0.85; margin-bottom:10px; }
        .modal-desc{ font-size:0.98rem; line-height:1.5; white-space:pre-wrap; }
        .modal-actions{
          display:flex; gap:10px; justify-content:flex-end; padding:12px 16px; border-top:1px solid #eee;
          flex-wrap:wrap; flex:0 0 auto;
        }
        .btn{
          appearance:none; border:1px solid #ddd; background:#fafafa; color:#111; padding:9px 12px;
          border-radius:10px; font-weight:600; cursor:pointer;
        }
        .btn:hover{ background:#f0f0f0; }
        .btn.primary{ background:#111; color:#fff; border-color:#111; }
        .btn.primary:hover{ filter:brightness(1.1); }

        @media (prefers-color-scheme: dark){
          .modal-card{ background:#151515; color:#eaeaea; }
          .modal-actions{ border-top-color:#2a2a2a; }
          .btn{ background:#1e1e1e; border-color:#2a2a2a; color:#eaeaea; }
          .btn.primary{ background:#eaeaea; color:#111; border-color:#eaeaea; }
          .modal-media{ background:#1b1b1b; }
        }
      `}</style>

      <div className="search-bar">
        <input
          type="text"
          name="category"
          value={search.category}
          onChange={(e) => setSearch((p) => ({ ...p, category: e.target.value }))}
          placeholder="Filter by Category"
        />
        <input
          type="text"
          name="keyword"
          value={search.keyword}
          onChange={(e) => setSearch((p) => ({ ...p, keyword: e.target.value }))}
          placeholder="Search by Keyword"
        />
        <button type="button">
          <FontAwesomeIcon icon={faSearch} />
        </button>
      </div>

      <div className="calendar-container">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialDate={new Date()}
          initialView="sixWeek"
          views={{ sixWeek: { type: "dayGrid", duration: { weeks: 6 } } }}
          firstDay={0}
          dayMaxEvents={true}
          height="auto"
          events={filtered.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            extendedProps: {
              description: e.description || "",
              location: e.location || "",
              imageUrl: e.imageUrl,
              eventUrl: e.url, // keep as extended prop (no auto-nav)
            },
          }))}
          eventContent={renderEventContent}
          eventClick={handleEventClick}
          /* Paint a random event image as the day's background */
          dayCellDidMount={(arg) => {
            const key = ymdLocal(arg.date);
            const img = dayImages[key];
            if (img) {
              // add gradient overlay via CSS ::before (defined above)
              (arg.el as HTMLElement).style.backgroundImage =
                `linear-gradient(rgba(0,0,0,.20), rgba(0,0,0,.20)), url("${img}")`;
            } else {
              (arg.el as HTMLElement).style.backgroundImage = "";
            }
          }}
        />
      </div>

      {/* Modal */}
      {selectedEvent && (
        <div
          className="modal-backdrop"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-modal-title"
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const img = selectedEvent.extendedProps.imageUrl as string | undefined;
              return img ? <img className="modal-media" src={img} alt="" loading="lazy" /> : null;
            })()}

            <div className="modal-body">
              <h2 id="event-modal-title" className="modal-title">
                {selectedEvent.title}
              </h2>
              <div className="modal-meta">
                {formatDateTime(selectedEvent.startStr)}
                {selectedEvent.endStr ? ` – ${formatDateTime(selectedEvent.endStr)}` : ""}
                {selectedEvent.extendedProps.location ? ` • ${selectedEvent.extendedProps.location}` : ""}
              </div>
              <div className="modal-desc">
                {selectedEvent.extendedProps.description || "No description provided."}
              </div>
            </div>

            <div className="modal-actions">
              {selectedEvent.extendedProps.eventUrl ? (
                <a
                  className="btn primary"
                  href={selectedEvent.extendedProps.eventUrl as string}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open event in new tab
                </a>
              ) : null}
              <button className="btn" onClick={closeModal} autoFocus>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Events;
