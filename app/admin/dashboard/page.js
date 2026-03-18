export default function AdminDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Admin Wooleen</h1>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow">Users</div>
        <div className="bg-white p-4 rounded-xl shadow">Providers</div>
        <div className="bg-white p-4 rounded-xl shadow">Requests</div>
      </div>
    </div>
  );
}
