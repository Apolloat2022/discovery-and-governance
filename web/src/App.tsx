import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { UserProvider } from "./context/UserContext";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ArtifactDetailPage } from "./pages/ArtifactDetailPage";
import { CreatePage } from "./pages/CreatePage";
import { GovernancePage } from "./pages/GovernancePage";
import { RecommendationsPage } from "./pages/RecommendationsPage";
import { RegistryPage } from "./pages/RegistryPage";
import { SearchPage } from "./pages/SearchPage";

export function App() {
  return (
    <UserProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<SearchPage />} />
          <Route path="/artifacts/:id" element={<ArtifactDetailPage />} />
          <Route path="/registry" element={<RegistryPage />} />
          <Route path="/registry/new" element={<CreatePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/governance" element={<GovernancePage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </UserProvider>
  );
}
