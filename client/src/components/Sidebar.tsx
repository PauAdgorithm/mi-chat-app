interface SidebarProps {
  user: { username: string };
  socket: any;
}

export function Sidebar({ user }: SidebarProps) {
  return (
    <div className="h-full flex flex-col p-4 bg-gray-50">
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tu Perfil</h3>
        <div className="flex items-center gap-3 p-2 bg-white rounded-md shadow-sm border">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
            {user.username[0].toUpperCase()}
          </div>
          <span className="font-medium text-gray-700">{user.username}</span>
        </div>
      </div>
      <div className="flex-1">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Salas</h3>
        <ul className="space-y-1">
          <li className="p-2 bg-blue-50 text-blue-700 rounded-md font-medium cursor-pointer"># general</li>
        </ul>
      </div>
    </div>
  );
}