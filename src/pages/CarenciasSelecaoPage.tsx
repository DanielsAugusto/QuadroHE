import { Link } from "react-router-dom";

export function CarenciasSelecaoPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold text-brand-dark">Carências</h1>
        <p className="mt-2 text-muted">
          Selecione o tipo de docente para gerenciar as carências.
        </p>
      </div>

      <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
        <Link
          to="/carencias/doc1"
          className="group flex min-w-[220px] flex-col items-center justify-center gap-6 rounded-2xl border-2 border-border bg-white px-16 py-12 shadow-sm transition-all hover:border-brand hover:shadow-md"
        >
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-14 w-14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
              />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-brand-dark">DOC I</h2>
          </div>
        </Link>

        <Link
          to="/carencias/doc2"
          className="group flex min-w-[220px] flex-col items-center justify-center gap-6 rounded-2xl border-2 border-border bg-white px-16 py-12 shadow-sm transition-all hover:border-brand hover:shadow-md"
        >
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-14 w-14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"
              />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-brand-dark">DOC II</h2>
          </div>
        </Link>
      </div>
    </div>
  );
}
