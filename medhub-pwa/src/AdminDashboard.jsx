// ===========================================================================
// AdminDashboard — hidden admin panel (route-guarded in App.jsx by is_admin).
//
// Manages the content tree: subjects -> courses -> lectures. Add a course
// (with subject), add a lecture to a course, edit a lecture (opens
// LectureEditor), and delete courses/lectures. Every write goes through
// Supabase and is enforced by the is_admin() RLS policies — the UI guard is
// convenience only; the database is the real gate.
//
// Writes reconcile with the server response (use returned rows / report errors
// via toasts) rather than blind optimism.
// ===========================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Pencil, Trash2, BookOpen, Loader2, CheckCircle2, AlertTriangle, X, Check,
  Image as ImageIcon, Upload,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import LectureEditor from "./LectureEditor";
import ThemeToggle from "./ThemeToggle";
import PageTransition from "./PageTransition";
import {
  validateImage, uploadCourseThumbnail, removeObjectPath, removeByPublicUrl, removeCourseThumbnails,
} from "./lib/courseThumbnails";

const SUCCESS = "#0E9F6E";
const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:text-slate-100 shadow-sm " +
  "focus:border-med-primary focus:outline-none focus:ring-1 focus:ring-med-primary transition-colors " +
  "dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:placeholder:text-slate-500";

/* -------------------------------------------------- toast */
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className="fixed right-5 top-5 z-50 max-w-sm">
      <div
        className="flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg dark:bg-white/10"
        style={{ borderColor: ok ? SUCCESS : "#E83151" }}
      >
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" style={{ color: SUCCESS }} />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" style={{ color: "#E83151" }} />
        )}
        <p className="flex-1 text-sm text-gray-800 dark:text-slate-100">{toast.msg}</p>
        <button onClick={onClose} className="text-gray-400 dark:text-slate-300 hover:text-gray-600 dark:text-slate-300"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* -------------------------------------------------- subject management */
function SubjectManager({ subjects, courseCount, onAdd, onRename, onDelete }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onAdd(name.trim());
    setBusy(false);
    setName("");
  };
  const startEdit = (s) => { setEditingId(s.id); setDraft(s.name); };
  const saveEdit = async (s) => {
    const v = draft.trim();
    setEditingId(null);
    if (v && v !== s.name) await onRename(s.id, v);
  };

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Subjects</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">These are the tabs students see. Courses link to a subject.</p>

      <div className="mt-4 flex gap-2">
        <input
          className={inputCls}
          placeholder="New subject name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button
          onClick={add}
          disabled={busy || !name.trim()}
          className="btn-premium inline-flex flex-none items-center gap-2 rounded-lg bg-med-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1577B0] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>

      {subjects.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-white/10">
          {subjects.map((s) => {
            const n = courseCount(s.id);
            const editing = editingId === s.id;
            return (
              <li key={s.id} className="flex items-center gap-2 py-2.5">
                {editing ? (
                  <>
                    <input
                      autoFocus
                      className={inputCls}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(s); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <button onClick={() => saveEdit(s)} className="rounded-lg px-2 py-1 text-med-primary hover:bg-med-primary/10 transition-colors"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditingId(null)} className="rounded-lg px-2 py-1 text-gray-500 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"><X className="h-4 w-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-slate-100">{s.name}</span>
                    <span className="flex-none text-xs text-gray-400 dark:text-slate-300">{n} course{n === 1 ? "" : "s"}</span>
                    <button onClick={() => startEdit(s)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-med-primary hover:bg-med-primary/10 transition-colors">
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </button>
                    <button onClick={() => onDelete(s)} className="inline-flex items-center rounded-lg px-2 py-1 text-sm font-medium text-med-accent hover:bg-med-accent/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------- add-course form */
function AddCourse({ subjects, onAdd }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    await onAdd({ title: title.trim(), description: description.trim() || null, subject_id: subjectId || null });
    setBusy(false);
    setTitle(""); setDescription(""); setSubjectId("");
  };

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Add a course</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="Course title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">— Subject (optional) —</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className={`${inputCls} sm:col-span-2`} placeholder="Short description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button
        onClick={submit}
        disabled={busy || !title.trim()}
        className="btn-premium mt-4 inline-flex items-center gap-2 rounded-lg bg-med-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1577B0] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add course
      </button>
    </div>
  );
}

/* -------------------------------------------------- course card */
// Thumbnail preview + upload/replace control for a course.
function CourseThumb({ course, onUploaded, notify }) {
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const inputRef = useRef(null);
  const url = course.thumbnail_url;

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    const v = validateImage(file);
    if (v) return notify("error", v);

    setBusy(true);
    const res = await uploadCourseThumbnail(course.id, file);
    if (res.error) { setBusy(false); return notify("error", `Upload failed: ${res.error}`); }

    const { error } = await supabase.from("courses").update({ thumbnail_url: res.url }).eq("id", course.id);
    if (error) {
      await removeObjectPath(res.path);          // DB failed -> don't orphan the new file
      setBusy(false);
      return notify("error", `Couldn't save: ${error.message}`);
    }
    if (url) await removeByPublicUrl(url);        // success -> delete the replaced old object
    setBroken(false);
    setBusy(false);
    onUploaded(course.id, res.url);
    notify("success", "Thumbnail updated");
  }

  return (
    <div className="mb-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-gradient-to-br from-med-primary to-[#0f5e8c]">
        {url && !broken ? (
          <img src={url} alt={course.title} className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-8 w-8 text-white/85" aria-hidden="true" />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-med-primary shadow-sm hover:bg-white disabled:opacity-60 dark:bg-[#0e172a]/85 dark:text-slate-100"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {url ? "Replace" : "Upload"}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
    </div>
  );
}

function CourseCard({ course, lectures, onAddLecture, onEditLecture, onDeleteLecture, onDeleteCourse, onUploaded, notify }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-5 shadow-sm">
      <CourseThumb course={course} onUploaded={onUploaded} notify={notify} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">{course.title}</h3>
          {course.description && <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-300">{course.description}</p>}
        </div>
        <button
          onClick={() => onDeleteCourse(course)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-med-accent hover:bg-med-accent/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {lectures.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-300">No lectures yet.</p>
        ) : (
          lectures.map((lec) => (
            <div key={lec.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-med-bg/40 dark:border-white/10 dark:bg-white/5 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-slate-100">{lec.title}</span>
              <div className="flex flex-none items-center gap-1">
                <button onClick={() => onEditLecture(lec.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-med-primary hover:bg-med-primary/10 transition-colors">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={() => onDeleteLecture(lec)} className="inline-flex items-center rounded-lg px-2 py-1 text-sm font-medium text-med-accent hover:bg-med-accent/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button
        onClick={() => onAddLecture(course.id)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
      >
        <Plus className="h-4 w-4" /> Add lecture
      </button>
    </div>
  );
}

/* -------------------------------------------------- page */
export default function AdminDashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState(null);

  const notify = (type, msg) => {
    setToast({ type, msg, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3500 ? null : t)), 3600);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: subs }, { data: crs }, { data: lecs }] = await Promise.all([
        supabase.from("subjects").select("id, name, sort_order").order("sort_order"),
        supabase.from("courses").select("id, title, description, subject_id, thumbnail_url, sort_order").order("sort_order"),
        supabase.from("lectures").select("id, title, course_id, sort_order").order("sort_order"),
      ]);
      if (!active) return;
      setSubjects(subs || []);
      setCourses(crs || []);
      setLectures(lecs || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  // group courses by subject (with an "Unassigned" bucket)
  const grouped = useMemo(() => {
    const bySubject = subjects.map((s) => ({ subject: s, courses: courses.filter((c) => c.subject_id === s.id) }));
    const unassigned = courses.filter((c) => !c.subject_id);
    if (unassigned.length) bySubject.push({ subject: { id: "_none", name: "Unassigned" }, courses: unassigned });
    return bySubject;
  }, [subjects, courses]);

  const lecturesFor = (courseId) => lectures.filter((l) => l.course_id === courseId);

  const courseCount = (subjectId) => courses.filter((c) => c.subject_id === subjectId).length;

  /* ---- subject mutations ---- */
  const addSubject = async (name) => {
    const { data, error } = await supabase
      .from("subjects")
      .insert({ name, sort_order: subjects.length })
      .select("id, name, sort_order")
      .single();
    if (error) return notify("error", `Couldn't add subject: ${error.message}`);
    setSubjects((s) => [...s, data]);
    notify("success", "Subject added");
  };

  const renameSubject = async (id, name) => {
    const prev = subjects;
    setSubjects((s) => s.map((x) => (x.id === id ? { ...x, name } : x)));   // optimistic
    const { error } = await supabase.from("subjects").update({ name }).eq("id", id);
    if (error) {
      setSubjects(prev);                                                     // revert on error
      notify("error", `Rename failed: ${error.message}`);
    } else {
      notify("success", "Subject renamed");
    }
  };

  const deleteSubject = async (subject) => {
    // Safety: BLOCK deletion when courses are linked (never orphan content).
    const n = courseCount(subject.id);
    if (n > 0) {
      return notify("error", `"${subject.name}" has ${n} course${n === 1 ? "" : "s"}. Move or delete them first.`);
    }
    if (!window.confirm(`Delete subject "${subject.name}"?`)) return;
    const { error } = await supabase.from("subjects").delete().eq("id", subject.id);
    if (error) return notify("error", `Couldn't delete: ${error.message}`);
    setSubjects((s) => s.filter((x) => x.id !== subject.id));
    notify("success", "Subject deleted");
  };

  /* ---- mutations (reconcile with server response) ---- */
  const addCourse = async (payload) => {
    const { data, error } = await supabase
      .from("courses")
      .insert({ ...payload, sort_order: courses.length })
      .select("id, title, description, subject_id, thumbnail_url, sort_order")
      .single();
    if (error) return notify("error", `Couldn't add course: ${error.message}`);
    setCourses((c) => [...c, data]);
    notify("success", "Course added");
  };

  // Reflect a freshly-uploaded thumbnail into local state.
  const onCourseThumbUploaded = (courseId, thumbnail_url) =>
    setCourses((c) => c.map((x) => (x.id === courseId ? { ...x, thumbnail_url } : x)));

  const addLecture = async (courseId) => {
    const order = lecturesFor(courseId).length;
    const { data, error } = await supabase
      .from("lectures")
      .insert({ course_id: courseId, title: "Untitled lecture", sort_order: order })
      .select("id, title, course_id, sort_order")
      .single();
    if (error) return notify("error", `Couldn't add lecture: ${error.message}`);
    setLectures((l) => [...l, data]);
    setEditingId(data.id);   // jump straight into the editor
  };

  const deleteLecture = async (lec) => {
    if (!window.confirm(`Delete lecture "${lec.title}"? This also removes its quizzes/questions.`)) return;
    const { error } = await supabase.from("lectures").delete().eq("id", lec.id);
    if (error) return notify("error", `Couldn't delete: ${error.message}`);
    setLectures((l) => l.filter((x) => x.id !== lec.id));
    notify("success", "Lecture deleted");
  };

  const deleteCourse = async (course) => {
    if (!window.confirm(`Delete course "${course.title}" and ALL its lectures? This cannot be undone.`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) return notify("error", `Couldn't delete: ${error.message}`);
    await removeCourseThumbnails(course.id);   // storage isn't cascaded — clean it up
    setCourses((c) => c.filter((x) => x.id !== course.id));
    setLectures((l) => l.filter((x) => x.course_id !== course.id));
    notify("success", "Course deleted");
  };

  const onSavedMeta = ({ id, title }) =>
    setLectures((l) => l.map((x) => (x.id === id ? { ...x, title } : x)));

  /* ---- editor sub-view ---- */
  if (editingId) {
    return (
      <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
        <Toast toast={toast} onClose={() => setToast(null)} />
        <LectureEditor
          lectureId={editingId}
          onBack={() => setEditingId(null)}
          onSavedMeta={onSavedMeta}
          notify={notify}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0e172a]/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <button onClick={() => navigate("/dashboard")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Portal
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary">
              <img src="/logo-wordmark.png" alt="Med Hub" className="h-7 w-auto object-contain" />
            </Link>
            <span className="text-sm font-medium text-gray-400 dark:text-slate-300">Admin</span>
          </div>
        </div>
      </header>

      <PageTransition as="main" className="mx-auto max-w-5xl px-5 pb-16">
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-100">Content management</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">Create courses and lectures, then open a lecture to edit its article and import MCQs.</p>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <SubjectManager
            subjects={subjects}
            courseCount={courseCount}
            onAdd={addSubject}
            onRename={renameSubject}
            onDelete={deleteSubject}
          />
          <AddCourse subjects={subjects} onAdd={addCourse} />
        </div>

        {loading ? (
          <div className="mt-8 flex items-center justify-center py-20 text-gray-400 dark:text-slate-300"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : courses.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white/60 p-12 text-center dark:border-white/10 dark:bg-white/5">
            <BookOpen className="mx-auto h-8 w-8 text-gray-400 dark:text-slate-300" />
            <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-slate-100">No courses yet</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-gray-500 dark:text-slate-300">Add your first course above to get started.</p>
          </div>
        ) : (
          <div className="mt-8 space-y-10">
            {grouped.map(({ subject, courses: cs }) => (
              cs.length === 0 ? null : (
                <section key={subject.id}>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{subject.name}</h2>
                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    {cs.map((course) => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        lectures={lecturesFor(course.id)}
                        onAddLecture={addLecture}
                        onEditLecture={setEditingId}
                        onDeleteLecture={deleteLecture}
                        onDeleteCourse={deleteCourse}
                        onUploaded={onCourseThumbUploaded}
                        notify={notify}
                      />
                    ))}
                  </div>
                </section>
              )
            ))}
          </div>
        )}
      </PageTransition>
    </div>
  );
}
