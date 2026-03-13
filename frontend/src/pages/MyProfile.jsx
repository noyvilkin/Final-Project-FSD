import PageLayout from "../components/layouts/PageLayout";

export default function MyProfile() {
  return (
    <PageLayout title="My Profile" subtitle="Your career preparation hub">
      <div className="rounded-2xl bg-white p-6 shadow-sm border">
        <p className="text-sm text-gray-500">Profile content will appear here</p>
      </div>
    </PageLayout>
  );
}