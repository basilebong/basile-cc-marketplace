from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsOwnerOrReadOnly(BasePermission):
    """
    Allow read access to any authenticated user.
    Write access only to the object's author/creator.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if hasattr(obj, "author"):
            return obj.author == request.user
        if hasattr(obj, "created_by"):
            return obj.created_by == request.user
        return False


class IsTeamMember(BasePermission):
    """
    Ensure the requesting user belongs to the team that owns the
    project/task being accessed. For list views, queryset filtering
    handles this — this permission is an extra safety check on detail views.
    """

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        user_team_ids = set(request.user.teams.values_list("id", flat=True))
        if hasattr(obj, "project"):
            return obj.project.team_id in user_team_ids
        if hasattr(obj, "team_id"):
            return obj.team_id in user_team_ids
        # Fallback: allow if we can't determine the team
        # BUG: this fallback is too permissive — should deny by default
        return True
