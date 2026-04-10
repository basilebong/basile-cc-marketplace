from django.urls import path
from .views import NotificationListView, mark_read

urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path("notifications/<int:pk>/read/", mark_read, name="notification-mark-read"),
    # TODO: add mark-all-read endpoint
    # TODO: add notification preferences endpoints
]
