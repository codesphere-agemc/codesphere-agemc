
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, useLocation, useParams } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import Navbar from '../components/Navbar';
import logo from '../assets/logo.png';
import CodingStats from '../components/CodingStats';
import DashboardProfileSidebar from '../components/DashboardProfileSidebar';
import ProfileBadges from '../components/ProfileBadges';
import DashboardDiscover from '../components/DashboardDiscover';
import MyResults from '../components/MyResults';
import ProfileAvatar from '../components/ProfileAvatar';
import MyProjectsSection from '../components/MyProjectsSection';
import BadgeLeaderboard from '../components/BadgeLeaderboard';
import Profile from './Profile';
import { calculateProfileCompletion } from '../lib/profileCompletion';
import '../css/UserDashboard.css';

function getNavigation(user) {
  return [
    { label: 'Overview', path: '/user/overview', icon: 'bi-grid-1x2' },
    {
      label: 'Search',
      path: user?.username
        ? `/user/${encodeURIComponent(user.username)}`
        : '/user/discover',
      icon: 'bi-search',
    },
    { label: 'My Projects', path: '/user/projects', icon: 'bi-kanban' },
    { label: 'My Events', path: '/user/activities', icon: 'bi-calendar-event' },
    { label: 'My Results', path: '/user/results', icon: 'bi-clipboard-data' },
    { label: 'My Profile', path: '/user/profile', icon: 'bi-person-lines-fill' },
  ];
}

function DashboardNavigationLink({ item, forceActive = false }) {
  return (
    <NavLink
      to={item.path}
      end
      className={({ isActive }) =>
        `user-dashboard-nav-item ${isActive || forceActive ? 'active' : ''}`
      }
    >
      <i className={`bi ${item.icon}`} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

function ProfileSection({ view }) {
  return <Profile embedded view={view} />;
}

async function requestDashboardOverview(user, signal) {
  const [profileResponse, projectsResponse] = await Promise.all([
    apiRequest('/users/profile', { signal }),
    apiRequest('/portfolio-projects', { signal }),
  ]);

  return {
    ...user,
    ...profileResponse.user,
    projects: projectsResponse.projects || [],
  };
}

function DashboardOverviewSection({ user }) {
  const [profile, setProfile] = useState(user || {});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async (signal) => {
    try {
      setProfile(await requestDashboardOverview(user, signal));
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message || 'Unable to load your overview.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    requestDashboardOverview(user, controller.signal)
      .then((loadedProfile) => {
        if (active) setProfile(loadedProfile);
      })
      .catch((loadError) => {
        if (active && !controller.signal.aborted) {
          setError(loadError.message || 'Unable to load your overview.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user]);

  const completion = useMemo(
    () => calculateProfileCompletion(profile),
    [profile]
  );
  return (
    <>
      <header className="dashboard-page-heading">
        <div>
          <span className="dashboard-page-kicker">YOUR CODESPHERE JOURNEY</span>
          <h1>Overview</h1>
          <p>Your profile progress, badges, and community achievements at a glance.</p>
        </div>
      </header>

      {error ? (
        <div className="dashboard-error" role="alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button
            type="button"
            className="dashboard-secondary-button"
            onClick={() => {
              setLoading(true);
              setError('');
              loadOverview();
            }}
          >
            <i className="bi bi-arrow-clockwise" /> Try again
          </button>
        </div>
      ) : loading ? (
        <section className="dashboard-loading-card" role="status">
          <span className="dashboard-loading-spinner" />
          <div>
            <strong>Loading your overview</strong>
            <p>Fetching your profile progress...</p>
          </div>
        </section>
      ) : (
        <div className="student-profile-layout dashboard-section-layout dashboard-overview-layout">
          <DashboardProfileSidebar
            user={profile}
            completion={completion}
            showBadges
            showLeaderboard
            showCompleteButton
          />

          <div className="student-profile-main dashboard-overview-content">
            <CodingStats />

            {/* My Badges & Community Milestones (Placed directly below Coding at a glance) */}
            <section className="dashboard-overview-badges-block">
              <div className="dashboard-badges-main">
                <ProfileBadges completion={completion} alwaysOpen />
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function EventRegistrationsSection() {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventFilter, setEventFilter] = useState('upcoming');
  const [now, setNow] = useState(null);

  const loadActivities = async (signal) =>
    apiRequest('/events/my-registrations', { signal });

  const fetchActivities = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await loadActivities();
      setRegistrations(
        (response.registrations || []).filter((registration) => registration.event)
      );
      setNow(Date.now());
    } catch (err) {
      setError(err.message || 'Unable to load your activities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    loadActivities(controller.signal)
      .then((response) => {
        if (active) {
          setRegistrations(
            (response.registrations || []).filter((registration) => registration.event)
          );
          setNow(Date.now());
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load your activities.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const formatEventDate = (date) => {
    if (!date) return 'Date to be announced';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return 'Date to be announced';
    }

    return parsedDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getEventDateParts = (date) => {
    if (!date) return { day: '--', month: 'TBA' };

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return { day: '--', month: 'TBA' };

    return {
      day: parsedDate.toLocaleDateString('en-IN', { day: '2-digit' }),
      month: parsedDate.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
    };
  };

  const getEventEndTime = (registration) => {
    const time = new Date(
      registration.event?.endDate || registration.event?.date
    ).getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  const upcomingRegistrations = registrations
    .filter((item) => item.status === 'registered' && now !== null && getEventEndTime(item) >= now)
    .sort((first, second) => getEventEndTime(first) - getEventEndTime(second));
  const pastRegistrations = registrations
    .filter((item) => item.status === 'registered' && (now === null || getEventEndTime(item) < now))
    .sort((first, second) => getEventEndTime(second) - getEventEndTime(first));
  const cancelledRegistrations = registrations
    .filter((item) => item.status === 'cancelled')
    .sort((first, second) => new Date(second.registeredAt) - new Date(first.registeredAt));
  const eventFilters = [
    { id: 'upcoming', label: 'Upcoming', tone: 'active', icon: 'bi-calendar-check', items: upcomingRegistrations },
    { id: 'past', label: 'Past events', tone: 'past', icon: 'bi-calendar2-check', items: pastRegistrations },
    { id: 'cancelled', label: 'Cancelled', tone: 'cancelled', icon: 'bi-calendar-x', items: cancelledRegistrations },
    { id: 'all', label: 'All events', tone: 'all', icon: 'bi-collection', items: [...upcomingRegistrations, ...pastRegistrations, ...cancelledRegistrations] },
  ];
  const visibleRegistrations =
    eventFilters.find((filter) => filter.id === eventFilter)?.items || [];

  return (
    <>
      <header className="dashboard-page-heading">
        <div>
          <span className="dashboard-page-kicker">YOUR CODESPHERE JOURNEY</span>
          <h1>My Events</h1>
          <p>Keep track of what's coming up and revisit your event history.</p>
        </div>
        <Link to="/events" className="dashboard-primary-button">
          <i className="bi bi-compass" /> Explore events
        </Link>
      </header>

      <div className={`student-profile-layout dashboard-section-layout dashboard-events-layout${loading || error ? ' is-message' : ''}`}>
        {loading ? (
          <section className="dashboard-loading-card" role="status">
            <span className="dashboard-loading-spinner" />
            <div>
              <strong>Loading your events</strong>
              <p>Fetching your registrations...</p>
            </div>
          </section>
        ) : error ? (
          <div className="dashboard-error" role="alert">
            <i className="bi bi-exclamation-circle" />
            <span>{error}</span>
            <button
              type="button"
              className="dashboard-secondary-button"
              onClick={fetchActivities}
            >
              <i className="bi bi-arrow-clockwise" /> Try again
            </button>
          </div>
        ) : (
          <>
            <aside className="student-profile-sidebar dashboard-events-sidebar">
              <section className="dashboard-events-overview">
                <span className="dashboard-page-kicker">YOUR ACTIVITY</span>
                <h2>Your registrations</h2>
                <p>Select a category to filter your event list.</p>

                <div className="dashboard-events-stats" role="group" aria-label="Filter event registrations">
                  {eventFilters.map((filter) => (
                    <button
                      type="button"
                      key={filter.id}
                      className={`dashboard-events-stat dashboard-stat-${filter.tone}${eventFilter === filter.id ? ' active' : ''}`}
                      aria-pressed={eventFilter === filter.id}
                      onClick={() => setEventFilter(filter.id)}
                    >
                      <span className="dashboard-stat-icon">
                        <i className={`bi ${filter.icon}`} aria-hidden="true" />
                      </span>
                      <span>{filter.label}</span>
                      <strong>{filter.items.length}</strong>
                    </button>
                  ))}
                </div>
              </section>
            </aside>

            <div className="student-profile-main dashboard-events-content">
              <section className="dashboard-content-section">
                <div className="dashboard-section-heading">
                  <div>
                    <span className="dashboard-page-kicker">YOUR CODESPHERE JOURNEY</span>
                    <h2>{eventFilters.find((filter) => filter.id === eventFilter)?.label} registered events</h2>
                    <p>Your registrations, all in one place.</p>
                  </div>
                </div>

                {registrations.length === 0 ? (
                  <div className="dashboard-empty-state">
                    <div className="dashboard-empty-icon"><i className="bi bi-calendar2-plus" /></div>
                    <span className="dashboard-page-kicker">YOUR NEXT CHAPTER</span>
                    <h2>No registrations yet</h2>
                    <p>Find a workshop, hackathon, or meetup and reserve your spot.</p>
                    <Link to="/events" className="dashboard-primary-button">
                      Browse events <i className="bi bi-arrow-right" />
                    </Link>
                  </div>
                ) : visibleRegistrations.length === 0 ? (
                  <div className="dashboard-filter-empty">
                    <i className="bi bi-calendar2-week" aria-hidden="true" />
                    <div>
                      <strong>No {eventFilter === 'upcoming' ? 'upcoming' : eventFilter} events you registered</strong>
                      <p>
                        {eventFilter === 'upcoming'
                          ? 'Your next event will show here after you register.'
                          : 'There are no registrations in this view yet.'}
                      </p>
                    </div>
                    {eventFilter === 'upcoming' && (
                      <Link to="/events" className="dashboard-secondary-button">
                        Explore events <i className="bi bi-arrow-right" />
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="dashboard-event-list">
                    {visibleRegistrations.map((registration) => {
                      const event = registration.event;
                      const isActive = registration.status === 'registered';
                      const eventDate = getEventDateParts(event?.date);
                      const description = event?.description
                        ?.replace(/<[^>]*>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();

                      return (
                        <article
                          className="dashboard-event-card"
                          key={registration._id}
                        >
                          <div className="dashboard-event-visual">
                            {event?.bannerImage?.url ? (
                              <img className="dashboard-event-image" src={event.bannerImage.url} alt="" />
                            ) : (
                              <div className="dashboard-event-image-placeholder">
                                <i className="bi bi-calendar-event" />
                              </div>
                            )}
                            <div className="dashboard-event-date-badge" aria-hidden="true">
                              <strong>{eventDate.day}</strong>
                              <span>{eventDate.month}</span>
                            </div>
                          </div>

                          <div className="dashboard-event-body">
                            <div className="dashboard-event-topline">
                              <span className="dashboard-event-category">{event?.category || 'CodeSphere event'}</span>
                              <span className={`dashboard-event-status ${isActive ? 'is-registered' : 'is-cancelled'}`}>
                                <i className={`bi ${isActive ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`} />
                                {isActive ? 'Registered' : 'Cancelled'}
                              </span>
                            </div>
                            <h3>{event?.title}</h3>
                            {description && <p className="dashboard-event-description">{description}</p>}
                            <div className="dashboard-event-meta">
                              <span><i className="bi bi-calendar3" />{formatEventDate(event?.date)}</span>
                              <span><i className={`bi ${event?.mode === 'Online' ? 'bi-camera-video' : 'bi-geo-alt'}`} />{event?.venue || event?.mode || 'Location to be announced'}</span>
                            </div>
                            {event?.slug && (
                              <Link to={`/events/${event.slug}`} className="dashboard-event-link">
                                Event details <i className="bi bi-arrow-up-right" />
                              </Link>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function UserDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const { username: routeUsername } = useParams();

  const pathname = location.pathname.replace(/\/+$/, '') || '/user';
  const navigation = getNavigation(user);
  const isDashboardMemberProfile = Boolean(
    routeUsername &&
    !navigation.some((item) => item.path === pathname)
  );
  const dashboardMemberUsername = isDashboardMemberProfile ? routeUsername : '';

  if (pathname === '/user') {
    return <Navigate to="/user/overview" replace />;
  }

  if (pathname === '/user/skills') {
    return <Navigate to="/user/profile" replace />;
  }

  if (pathname === '/user/badges') {
    return <Navigate to="/user/projects" replace />;
  }

  if (pathname === '/user/milestone') {
    return <Navigate to="/user/projects" replace />;
  }

  if (pathname === '/user/settings') {
    return <Navigate to="/user/profile" replace />;
  }

  if (pathname === '/user/discover' && user?.username) {
    return <Navigate to={`/user/${encodeURIComponent(user.username)}`} replace />;
  }

  return (
    <>
      <Navbar />

      <main className="user-dashboard-page">
        <aside className="user-dashboard-sidebar">
          <Link to="/" className="user-dashboard-logo">
            <img src={logo} alt="CodeSphere" />
          </Link>

          <div className="user-dashboard-sidebar-label">WORKSPACE</div>

          <nav className="user-dashboard-navigation" aria-label="Dashboard navigation">
            {navigation.map((item) => (
              <DashboardNavigationLink
                key={item.path}
                item={item}
                forceActive={isDashboardMemberProfile && item.label === 'Search'}
              />
            ))}
          </nav>

          <div className="user-dashboard-sidebar-bottom">
            <div className="user-dashboard-account">
              <ProfileAvatar
                user={user}
                name={user?.name || 'U'}
                fallbackClassName="user-dashboard-account-avatar"
                fallback={user?.name?.trim()?.[0]?.toUpperCase() || 'U'}
              />
              <div>
                <strong>{user?.name || 'CodeSphere member'}</strong>
                <span>{user?.username ? `@${user.username}` : 'Member account'}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="user-dashboard-main">
          <div className="user-dashboard-container">
            {pathname === '/user/overview' ? (
              <DashboardOverviewSection user={user} />
            ) : pathname === '/user/projects' || pathname === '/user/milestone' ? (
              <MyProjectsSection user={user} />
            ) : pathname === '/user/profile' ? (
              <ProfileSection view="profile" />
            ) : pathname === '/user/activities' ? (
              <EventRegistrationsSection />
            ) : pathname === '/user/results' ? (
              <MyResults />
            ) : user?.username &&
              routeUsername?.toLowerCase() === user.username.toLowerCase() ? (
              <DashboardDiscover user={user} />
            ) : isDashboardMemberProfile ? (
              <DashboardDiscover user={user} profileUsername={dashboardMemberUsername} />
            ) : (
              <Navigate to="/user/profile" replace />
            )}
          </div>
        </div>

        <nav className="user-dashboard-mobile-nav" aria-label="Mobile dashboard navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end
              className={({ isActive }) =>
                `user-dashboard-mobile-item ${
                  isActive || (isDashboardMemberProfile && item.label === 'Search')
                    ? 'active'
                    : ''
                }`
              }
            >
              <i className={`bi ${item.icon}`} aria-hidden="true" />
              <span>{item.label.replace('My ', '')}</span>
            </NavLink>
          ))}
        </nav>
      </main>
    </>
  );
}
