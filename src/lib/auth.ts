export function getRoleDestination(role: string): string {
  switch (role) {
    case "admin":
      return "/platform-admin";
    case "owner":
      return "/organization-owner";
    case "project_manager":
      return "/project-manager";
    case "team_member":
      return "/team-member";
    default:
      return "/";
  }
}

export function clearStoredSession(): void {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  localStorage.removeItem("role");
}
