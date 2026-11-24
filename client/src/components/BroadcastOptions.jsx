import '../css/Updates.css';

export default function BroadcastOptions({ value, onChange, allowEmail = true }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.checked });

  return (
    <div className="broadcast-options-simple">
      <label className="broadcast-simple-row">
        <input
          type="checkbox"
          checked={Boolean(value.sendNotification)}
          onChange={set('sendNotification')}
        />
        <span>Send to users&apos; notifications</span>
      </label>
      {allowEmail && (
        <label className="broadcast-simple-row">
          <input
            type="checkbox"
            checked={Boolean(value.sendEmail)}
            onChange={set('sendEmail')}
          />
          <span>Send to users&apos; emails</span>
        </label>
      )}
    </div>
  );
}
