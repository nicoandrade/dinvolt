import { LoginScreen } from "@/components/login-screen";
import { LoginView } from "@/components/login-view";
import { developmentAdminDefaults } from "@/lib/dev-admin";

const LoginPage = () => (
  <LoginView>
    <LoginScreen defaultValues={developmentAdminDefaults()} />
  </LoginView>
);

export default LoginPage;
