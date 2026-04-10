from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserMeView, TeamViewSet, ProjectViewSet

router = DefaultRouter()
router.register(r"teams", TeamViewSet, basename="team")
router.register(r"projects", ProjectViewSet, basename="project")

urlpatterns = [
    path("users/me/", UserMeView.as_view(), name="user-me"),
    path("", include(router.urls)),
]
