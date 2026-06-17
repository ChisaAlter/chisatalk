import toolboxUI from "./ui/remote_operit_setup/index.ui.js";

export function registerToolPkg() {
  ToolPkg.registerToolboxUiModule({
    id: "remote_operit_setup",
    runtime: "compose_dsl",
    screen: toolboxUI,
    params: {},
    title: {
      zh: "远程 ChisaTalk 配置",
      en: "Remote ChisaTalk Setup",
    },
  });

  ToolPkg.registerAppLifecycleHook({
    id: "remote_operit_app_create",
    event: "application_on_create",
    function: onApplicationCreate,
  });

  return true;
}

export function onApplicationCreate() {
  return { ok: true };
}
