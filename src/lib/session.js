const KEY = "itsm_user";

const HOME = {
  technician: "/teknisyen",
  admin: "/yonetim",
  employee: "/portal",
};

// sessionStorage sekme başına ayrıdır; localStorage tüm sekmelerde ortaktır.
// İki rolü yan yana test edebilmek için sekme bazlı oturum gerekiyor.
export function getUser() {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setUser(user) {
  sessionStorage.setItem(KEY, JSON.stringify(user));
}

export function clearUser() {
  sessionStorage.removeItem(KEY);
}

export function homeFor(role) {
  return HOME[role] || HOME.employee;
}

// Oturum yoksa girişe, yanlış roldeyse kendi ana sayfasına yönlendirir.
export function guard(navigate, allowedRoles) {
  const user = getUser();

  if (!user) {
    navigate("/", { replace: true });
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    navigate(homeFor(user.role), { replace: true });
    return null;
  }

  return user;
}
