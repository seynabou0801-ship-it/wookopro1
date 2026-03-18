export default function ClientDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Dashboard Client</h1>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl shadow">
          <p>Demandes</p>
          <p className="text-2xl font-bold">0</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <p>Devis</p>
          <p className="text-2xl font-bold">0</p>
        </div>
      </div>
    </div>
  );
}
