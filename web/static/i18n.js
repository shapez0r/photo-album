// photoalbum translations (English, Russian, Spanish). Loaded synchronously in
// <head>, before app.js. By default the UI follows the browser's preferred
// languages; a different language can be chosen in the settings and is
// remembered in this browser (localStorage). Dates use the same locale.
(() => {
  "use strict";

  const SUPPORTED = ["en", "ru", "es"];
  const NATIVE = { en: "English", ru: "Русский", es: "Español" };
  const KEY = "photoalbum.lang";

  const DICT = {
    en: {
      "doc.title": "photoalbum — little moments",
      "auth.tagline": "A quiet place for your little moments. Snap a photo, and it settles into your album.",
      "auth.signIn": "Sign in",
      "auth.createAccount": "Create account",
      "auth.displayName": "Your name",
      "auth.email": "E-mail",
      "auth.password": "Password",
      "auth.repeatPassword": "Repeat password",
      "auth.signupDisabled": "Account creation is disabled on this server or for your network.",
      "auth.passwordShort": "Password must have at least 8 characters.",
      "auth.passwordMismatch": "Passwords do not match.",
      "auth.signInAgain": "Please sign in again.",
      "top.live": "Live",
      "top.settings": "Settings",
      "set.theme": "Theme",
      "set.language": "Language",
      "set.signOut": "Sign out",
      "lang.auto": "System",
      "album.hello": "Hello, {name}",
      "album.count": "{n} moments",
      "album.count1": "1 moment",
      "album.take": "Take a photo",
      "album.upload": "Choose from gallery",
      "album.emptyTitle": "Your album is waiting",
      "album.emptyText": "Take your first photo — a cup of coffee, the light on your window, a friend laughing.",
      "album.storage": "{used} of {quota} used",
      "album.model": "Model: {model}",
      "cam.title": "New moment",
      "cam.shutter": "Take photo",
      "cam.flip": "Switch camera",
      "cam.retake": "Retake",
      "cam.add": "Add to album",
      "cam.caption": "Write a little caption (optional)",
      "cam.adding": "Adding…",
      "cam.added": "Added to your album ♡",
      "cam.noCamera": "The camera is not available here — choose a photo instead.",
      "view.save": "Save caption",
      "view.delete": "Delete",
      "view.confirmDelete": "Delete this photo from your album?",
      "view.deleted": "Photo deleted",
      "view.saved": "Caption saved",
      "live.empty": "Add a few photos and they will drift by here.",
      "common.close": "Close",
      "common.cancel": "Cancel",
      "err.generic": "Something went wrong. Please try again.",
      "err.notImage": "This file is not a photo.",
    },
    ru: {
      "doc.title": "photoalbum — маленькие моменты",
      "auth.tagline": "Тихое место для маленьких моментов. Сделайте фото — и оно аккуратно ляжет в альбом.",
      "auth.signIn": "Войти",
      "auth.createAccount": "Создать аккаунт",
      "auth.displayName": "Ваше имя",
      "auth.email": "E-mail",
      "auth.password": "Пароль",
      "auth.repeatPassword": "Повторите пароль",
      "auth.signupDisabled": "Создание аккаунтов отключено на этом сервере или для вашей сети.",
      "auth.passwordShort": "Пароль должен содержать не меньше 8 символов.",
      "auth.passwordMismatch": "Пароли не совпадают.",
      "auth.signInAgain": "Пожалуйста, войдите снова.",
      "top.live": "Слайд-шоу",
      "top.settings": "Настройки",
      "set.theme": "Тема",
      "set.language": "Язык",
      "set.signOut": "Выйти",
      "lang.auto": "Системный",
      "album.hello": "Привет, {name}",
      "album.count": "Моментов: {n}",
      "album.count1": "1 момент",
      "album.take": "Сделать фото",
      "album.upload": "Выбрать из галереи",
      "album.emptyTitle": "Ваш альбом ждёт",
      "album.emptyText": "Сделайте первое фото — чашка кофе, свет на окне, смех подруги.",
      "album.storage": "Занято {used} из {quota}",
      "album.model": "Модель: {model}",
      "cam.title": "Новый момент",
      "cam.shutter": "Снять",
      "cam.flip": "Сменить камеру",
      "cam.retake": "Переснять",
      "cam.add": "Добавить в альбом",
      "cam.caption": "Короткая подпись (необязательно)",
      "cam.adding": "Добавляем…",
      "cam.added": "Добавлено в альбом ♡",
      "cam.noCamera": "Камера здесь недоступна — выберите фото из галереи.",
      "view.save": "Сохранить подпись",
      "view.delete": "Удалить",
      "view.confirmDelete": "Удалить это фото из альбома?",
      "view.deleted": "Фото удалено",
      "view.saved": "Подпись сохранена",
      "live.empty": "Добавьте несколько фото — и они будут плавно сменяться здесь.",
      "common.close": "Закрыть",
      "common.cancel": "Отмена",
      "err.generic": "Что-то пошло не так. Попробуйте ещё раз.",
      "err.notImage": "Этот файл не является фотографией.",
    },
    es: {
      "doc.title": "photoalbum — pequeños momentos",
      "auth.tagline": "Un rincón tranquilo para tus pequeños momentos. Haz una foto y se guarda en tu álbum.",
      "auth.signIn": "Iniciar sesión",
      "auth.createAccount": "Crear cuenta",
      "auth.displayName": "Tu nombre",
      "auth.email": "Correo electrónico",
      "auth.password": "Contraseña",
      "auth.repeatPassword": "Repite la contraseña",
      "auth.signupDisabled": "La creación de cuentas está desactivada en este servidor o para tu red.",
      "auth.passwordShort": "La contraseña debe tener al menos 8 caracteres.",
      "auth.passwordMismatch": "Las contraseñas no coinciden.",
      "auth.signInAgain": "Vuelve a iniciar sesión.",
      "top.live": "En vivo",
      "top.settings": "Ajustes",
      "set.theme": "Tema",
      "set.language": "Idioma",
      "set.signOut": "Cerrar sesión",
      "lang.auto": "Sistema",
      "album.hello": "Hola, {name}",
      "album.count": "{n} momentos",
      "album.count1": "1 momento",
      "album.take": "Hacer una foto",
      "album.upload": "Elegir de la galería",
      "album.emptyTitle": "Tu álbum te espera",
      "album.emptyText": "Haz tu primera foto: una taza de café, la luz en la ventana, una amiga riendo.",
      "album.storage": "{used} de {quota} usados",
      "album.model": "Modelo: {model}",
      "cam.title": "Nuevo momento",
      "cam.shutter": "Hacer foto",
      "cam.flip": "Cambiar cámara",
      "cam.retake": "Repetir",
      "cam.add": "Añadir al álbum",
      "cam.caption": "Escribe un pie de foto (opcional)",
      "cam.adding": "Añadiendo…",
      "cam.added": "Añadida a tu álbum ♡",
      "cam.noCamera": "La cámara no está disponible aquí: elige una foto.",
      "view.save": "Guardar pie de foto",
      "view.delete": "Eliminar",
      "view.confirmDelete": "¿Eliminar esta foto del álbum?",
      "view.deleted": "Foto eliminada",
      "view.saved": "Pie de foto guardado",
      "live.empty": "Añade algunas fotos y pasarán por aquí suavemente.",
      "common.close": "Cerrar",
      "common.cancel": "Cancelar",
      "err.generic": "Algo salió mal. Inténtalo de nuevo.",
      "err.notImage": "Este archivo no es una foto.",
    },
  };

  function systemLang() {
    for (const l of navigator.languages || [navigator.language || "en"]) {
      const base = String(l).toLowerCase().split("-")[0];
      if (SUPPORTED.includes(base)) return base;
    }
    return "en";
  }

  function stored() {
    try {
      const v = localStorage.getItem(KEY);
      return SUPPORTED.includes(v) ? v : "";
    } catch { return ""; }
  }

  let lang = stored() || systemLang();

  function t(key, vars) {
    let s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  }

  function apply(root = document) {
    document.documentElement.lang = lang;
    document.title = t("doc.title");
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(";")) {
        const [attr, key] = pair.split(":");
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      }
    });
  }

  function setLang(v) {
    try {
      if (SUPPORTED.includes(v)) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    lang = SUPPORTED.includes(v) ? v : systemLang();
    apply();
  }

  window.I18N = {
    t, apply, setLang,
    get lang() { return lang; },
    get choice() { return stored() || "auto"; },
    supported: SUPPORTED, native: NATIVE,
  };
})();
