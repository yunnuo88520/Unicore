// Author: yunnuo <ymz@ebox.vip>
{
  const slow = document.getElementById('boot-slow');
  if (slow) {
    slow.querySelector('button')?.addEventListener('click', () => window.location.reload());
    setTimeout(() => {
      if (slow.isConnected) slow.classList.add('boot-show');
    }, 8000);
  }
}
